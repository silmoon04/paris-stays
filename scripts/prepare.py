"""Normalize private Airbnb actor output into the public Paris Stays contract.

Raw actor data stays in .private. Only concise listing facts and cleaned excerpts
are written to public/data; private evidence is retained for Luna review jobs.
"""
import argparse
import concurrent.futures
import hashlib
import html
import io
import json
import re
import urllib.request
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.private'
PUBLIC = ROOT / 'public' / 'data'
CHECK_IN, CHECK_OUT, ADULTS, CURRENCY = '2026-10-31', '2026-11-04', 5, 'GBP'
ZONES = {
    'west': (48.857, 48.878, 2.316, 2.345),
    'east': (48.855, 48.872, 2.340, 2.362),
}

def read(path, default=None):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else default

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)

def clean_text(value):
    if not isinstance(value, str):
        return ''
    value = html.unescape(re.sub(r'<[^>]*>', ' ', value))
    value = re.sub(r'(?i)\b(?:https?://|www\.)\S+', ' ', value)
    value = re.sub(r'(?i)\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b', ' ', value)
    value = re.sub(r'(?i)\b(?:phone|telephone|mobile|contact)\s*[:#-]?\s*(?:\+?\d[\d ()-]{7,})', ' ', value)
    value = re.sub(r'(?i)\b(?:registration|licen[cs]e|permit|registration number|num[eé]ro d.?enregistrement)\s*(?:no\.?|number|#|:)?\s*[A-Z0-9-]{5,}', ' ', value)
    return re.sub(r'\s+', ' ', value).strip()

def money(value):
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    match = re.search(r'-?[\d][\d.,\s]*', value.replace('\u202f', ' '))
    if not match:
        return None
    token = match.group().replace(' ', '')
    # Airbnb UK prices use comma thousands and dot decimals.
    try:
        return float(token.replace(',', ''))
    except ValueError:
        return None

def query_params(url):
    try:
        return urllib.parse.parse_qs(urllib.parse.urlparse(url or '').query)
    except (TypeError, ValueError):
        return {}

def trip_matches(row):
    q = query_params(row.get('url'))
    def check(field, url_keys, expected, transform=lambda value: str(value)):
        values = [row.get(field)]
        values.extend(q[key][0] for key in url_keys if q.get(key))
        present = [transform(v) for v in values if v not in (None, '')]
        return bool(present) and all(v == expected for v in present)
    return (check('checkIn', ('checkin', 'check_in'), CHECK_IN, lambda v: str(v)[:10]) and
            check('checkOut', ('checkout', 'check_out'), CHECK_OUT, lambda v: str(v)[:10]) and
            check('adults', ('adults',), str(ADULTS)) and
            check('currency', ('currency',), CURRENCY, lambda v: str(v).upper()))

def quote_for(row):
    price = row.get('price') if isinstance(row.get('price'), dict) else {}
    breakdown = price.get('breakDown') if isinstance(price.get('breakDown'), dict) else {}
    total_entry, taxes_entry = breakdown.get('total'), breakdown.get('taxes')
    total = money(total_entry.get('price')) if isinstance(total_entry, dict) else None
    # A present, explicitly itemized tax amount is required; totalBeforeTaxes is never a total.
    taxes = money(taxes_entry.get('price')) if isinstance(taxes_entry, dict) else None
    explicit_taxes = isinstance(taxes_entry, dict) and taxes_entry.get('price') is not None
    matching = trip_matches(row)
    url_params = query_params(row.get('url'))
    url_in = url_params.get('checkin') or url_params.get('check_in') or ['']
    url_out = url_params.get('checkout') or url_params.get('check_out') or ['']
    fees = []
    for key in ('serviceFee', 'cleaningFee', 'taxes'):
        entry = breakdown.get(key)
        amount = money(entry.get('price')) if isinstance(entry, dict) else None
        if amount is not None:
            fees.append({'label': clean_text(entry.get('description')) or key, 'amount': amount})
    stamp = row.get('timestamp') if isinstance(row.get('timestamp'), str) else ''
    return {
        'total': total if matching else None,
        'label': clean_text(price.get('label')) or clean_text(price.get('qualifier')) or 'Price to check',
        'complete': bool(matching and total is not None and explicit_taxes and taxes is not None),
        'available': row.get('isAvailable') if isinstance(row.get('isAvailable'), bool) else None,
        'checkedAt': stamp,
        'checkIn': CHECK_IN if matching else str(row.get('checkIn') or url_in[0]),
        'checkOut': CHECK_OUT if matching else str(row.get('checkOut') or url_out[0]),
        'adults': ADULTS if matching else _int(row.get('adults') or url_params.get('adults', [None])[0]),
        'currency': CURRENCY if matching else str(row.get('currency') or url_params.get('currency', [''])[0]).upper(),
        'fees': fees,
    }

def _int(value):
    try: return int(value)
    except (TypeError, ValueError): return None

def _number(value):
    try: return float(str(value).replace(',', '.'))
    except (TypeError, ValueError): return None

def amenities_flat(row):
    result = []
    for group in row.get('amenities') or []:
        if not isinstance(group, dict): continue
        for item in group.get('values') or []:
            if isinstance(item, dict):
                result.append((clean_text(item.get('title')), clean_text(item.get('subtitle')), item.get('available')))
    return result

def fact(value, evidence, reviewed_at, confidence='high'):
    return {'value': value, 'source': 'listing', 'confidence': confidence,
            'evidence': clean_text(evidence)[:180], 'reviewedAt': reviewed_at}

def listing_facts(row):
    desc = clean_text(row.get('description'))
    sub = row.get('subDescription') if isinstance(row.get('subDescription'), dict) else {}
    items = [clean_text(x) for x in (sub.get('items') or [])]
    reviewed = row.get('timestamp') if isinstance(row.get('timestamp'), str) else ''
    facts, am = {}, amenities_flat(row)
    # Exact structured amenity labels only support these positive Boolean claims.
    labels = {name.casefold(): (name, subtitle, available) for name, subtitle, available in am}
    bool_amenities = {
        'kitchen': ('Kitchen',), 'dishwasher': ('Dishwasher',), 'oven': ('Oven',),
        'hob': ('Stove', 'Cooker', 'Electric stove', 'Gas stove'), 'fridge': ('Refrigerator', 'Fridge'),
        'washingMachine': ('Washing machine',), 'airConditioning': ('Air conditioning',),
        'wifi': ('Wifi', 'Wi-Fi'), 'lift': ('Elevator', 'Lift'),
    }
    for key, options in bool_amenities.items():
        for option in options:
            entry = labels.get(option.casefold())
            if entry and isinstance(entry[2], bool):
                evidence = f'Listing marks {entry[0]} available' if entry[2] else f'Listing marks {entry[0]} unavailable'
                facts[key] = fact(entry[2], evidence, reviewed)
                break
    bedsrooms = next((re.search(r'(\d+(?:[.,]\d+)?)\s+bedrooms?\b', x, re.I) for x in items if re.search(r'\d+(?:[.,]\d+)?\s+bedrooms?\b', x, re.I)), None)
    if bedsrooms:
        source = next(x for x in items if bedsrooms.group(0) in x)
        facts['bedrooms'] = fact(_number(bedsrooms.group(1)), source, reviewed)
    # Toilet counts require an explicit count of toilets or WCs; bathroom counts are not a proxy.
    toilets = re.search(r'\b(\d+(?:[.,]\d+)?)\s+(?:separate\s+)?(?:toilets?|WCs?)\b', desc, re.I)
    if toilets:
        facts['toilets'] = fact(_number(toilets.group(1)), toilets.group(0), reviewed, 'medium')
    # Explicit facility wording is usable when unambiguous. Shower gel alone is not.
    shower_count = re.search(r'\b(\d+)\s+(?:modern\s+)?showers?\b', desc, re.I)
    shower_amenity = next((a for a in am if re.fullmatch(r'shower(?:\s+only)?', a[0], re.I) and a[2] is True), None)
    if shower_count:
        facts['showers'] = fact(_number(shower_count.group(1)), shower_count.group(0), reviewed, 'medium')
    elif shower_amenity:
        facts['showers'] = fact(1, f'Listed amenity: {shower_amenity[0]}', reviewed, 'low')
    area = re.search(r'\b(\d+(?:[.,]\d+)?)\s*(?:m²|m2|sqm|square metres?|square meters?)\b', desc, re.I)
    if area:
        facts['areaM2'] = fact(_number(area.group(1)), area.group(0), reviewed, 'medium')
    seats = re.search(r'\b(?:dining\s+)?table\s+(?:that\s+)?(?:can\s+)?accommodate\s+(\d+)\s+(?:guests|people)\b|\bdining\s+(?:table\s+)?for\s+(\d+)\b', desc, re.I)
    if seats:
        n = int(next(g for g in seats.groups() if g))
        facts['diningSeats'] = fact(n, seats.group(0), reviewed, 'medium')
    return facts

def structured_evidence(row):
    return {
        'description': clean_text(row.get('description')),
        'amenities': [{'title': n, 'subtitle': s, 'available': a} for n, s, a in amenities_flat(row)],
        'subDescription': row.get('subDescription') if isinstance(row.get('subDescription'), dict) else {},
        'images': [{'index': i, 'url': im.get('imageUrl'), 'caption': clean_text(im.get('caption'))}
                   for i, im in enumerate(row.get('images') or []) if isinstance(im, dict) and im.get('imageUrl')],
    }

def review_evidence(row):
    """Keep only public review content and listing metadata, never reviewer identity."""
    found = []
    candidates = row.get('reviews') or row.get('reviewData') or []
    if isinstance(candidates, dict): candidates = candidates.get('reviews') or []
    if not isinstance(candidates, list): return found
    for review in candidates:
        if not isinstance(review, dict): continue
        text = clean_text(review.get('comments') or review.get('text') or review.get('comment'))
        rid = review.get('id') or review.get('reviewId')
        date = review.get('date') or review.get('createdAt')
        rating = review.get('rating')
        if text:
            found.append({'id': str(rid) if rid is not None else '', 'date': str(date) if date is not None else '',
                          'rating': rating if isinstance(rating, (int, float)) else None, 'text': text})
    return found

def listing_id_from_review(row):
    url = row.get('startUrl') or row.get('url') or ''
    match = re.search(r'/rooms/(\d+)(?:[/?#]|$)', urllib.parse.urlparse(url).path)
    return match.group(1) if match else None

def normalize_review_actor_rows(rows):
    """Join the inspected review actor schema through its /rooms/<listing id> URL."""
    by_listing = {}
    for row in rows:
        if not isinstance(row, dict): continue
        listing_id = listing_id_from_review(row)
        if listing_id is None: continue
        text = clean_text(row.get('localizedText') or row.get('text'))
        if not text: continue
        review_id = row.get('id')
        date = row.get('createdAt') or row.get('localizedDate') or ''
        rating = row.get('rating')
        by_listing.setdefault(listing_id, []).append({
            'id': str(review_id) if review_id is not None else '',
            'date': str(date),
            'rating': rating if isinstance(rating, (int, float)) and not isinstance(rating, bool) else None,
            'text': text,
        })
    return by_listing

def hash_evidence(evidence, reviews):
    payload = {'description': evidence['description'], 'amenities': evidence['amenities'],
               'subDescription': evidence['subDescription'], 'images': evidence['images'], 'reviews': reviews}
    blob = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(blob).hexdigest()

def zone_list(lat, lon):
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)): return []
    found = []
    for name, (south, north, west, east) in ZONES.items():
        if south <= lat <= north and west <= lon <= east: found.append(name)
    return found

def photo_priority(caption):
    text = caption.casefold()
    if re.search(r'\b(bed|bedroom|sleeping|mattress)\b', text): return 'bedroom', 0
    if re.search(r'\b(kitchen|cook|stove|oven|fridge|refrigerator)\b', text): return 'kitchen', 1
    if re.search(r'\b(dining|dinner|table|eat)\b', text): return 'dining', 2
    if re.search(r'\b(toilet|wc|bathroom|bath|shower|vanity)\b', text): return 'bath', 3
    if re.search(r'\b(lift|elevator|stairs|staircase|entrance|access)\b', text): return 'access', 4
    if re.search(r'\b(living|lounge|interior|room)\b', text): return 'interior', 5
    return 'other', 6

def select_photo_evidence(images, limit=24):
    eligible = []
    for item in images:
        if not isinstance(item, dict) or not isinstance(item.get('url'), str): continue
        parsed = urllib.parse.urlparse(item['url'])
        if parsed.scheme != 'https' or parsed.hostname != 'a0.muscache.com': continue
        cat, priority = photo_priority(item.get('caption', ''))
        eligible.append((priority, int(item.get('index', len(eligible))), cat, item))
    # Interleave categories so one run of repetitive bedroom captions cannot crowd out other rooms.
    grouped = {}
    for item in eligible: grouped.setdefault(item[2], []).append(item)
    selected, bedroom_count = [], 0
    while len(selected) < limit and any(grouped.values()):
        progressed = False
        for category in ('bedroom', 'kitchen', 'dining', 'bath', 'access', 'interior', 'other'):
            bucket = grouped.get(category, [])
            if not bucket: continue
            if category == 'bedroom' and bedroom_count >= 4:
                grouped[category] = []
                continue
            selected.append(bucket.pop(0)); progressed = True
            if category == 'bedroom': bedroom_count += 1
            if len(selected) >= limit: break
        if not progressed: break
    return [x[3] for x in selected]

def candidate_score(row):
    facts = listing_facts(row)
    rating = row.get('rating') if isinstance(row.get('rating'), dict) else {}
    score = float(rating.get('guestSatisfaction') or 0) * 12
    score += min(10, math_log1p(float(rating.get('reviewsCount') or 0)))
    score += sum(2 for key in ('kitchen', 'dishwasher', 'oven', 'hob', 'fridge') if facts.get(key, {}).get('value') is True)
    score += 2 if facts.get('diningSeats', {}).get('value', 0) >= 5 else 0
    sub = row.get('subDescription') if isinstance(row.get('subDescription'), dict) else {}
    items = [clean_text(x) for x in (sub.get('items') or [])]
    bedrooms = next((_number(m.group(1)) for text in items if (m := re.search(r'(\d+(?:[.,]\d+)?)\s+bedrooms?\b', text, re.I))), None)
    advertised_beds = next((_number(m.group(1)) for text in items if (m := re.search(r'(\d+(?:[.,]\d+)?)\s+beds?\b', text, re.I))), None)
    if bedrooms is not None and bedrooms >= 4: score += 8
    if advertised_beds is not None and advertised_beds >= 5: score += 7
    if facts.get('toilets', {}).get('value', 0) >= 3: score += 9
    if facts.get('lift', {}).get('value') is True: score += 5
    return score

def math_log1p(value):
    import math
    return math.log1p(max(0, value))

def download_photo(item):
    url = item['url']
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'a0.muscache.com': return None
    request = urllib.request.Request(url, headers={'User-Agent': 'ParisStaysEvidence/1.0'})
    try:
        with urllib.request.urlopen(request, timeout=18) as response:
            if response.geturl().split('/')[2].split(':')[0] != 'a0.muscache.com': return None
            mime = response.headers.get_content_type()
            if mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'): return None
            data = response.read(8 * 1024 * 1024 + 1)
            if len(data) > 8 * 1024 * 1024: return None
            return item, data, mime
    except Exception:
        return None

def read_cached_photo(item, ident):
    directory = PRIVATE / 'photos' / ident
    for extension, mime in (('jpg', 'image/jpeg'), ('png', 'image/png'), ('webp', 'image/webp'), ('gif', 'image/gif')):
        path = directory / f"{item['index']}.{extension}"
        if path.exists() and path.stat().st_size <= 8 * 1024 * 1024:
            return item, path.read_bytes(), mime
    return None

def make_contact_sheet(ident, photos, directory):
    from PIL import Image, ImageDraw, ImageFont
    cards = []
    for item, data, _mime in photos:
        try:
            image = Image.open(io.BytesIO(data)).convert('RGB')
            image.thumbnail((240, 155))
            card = Image.new('RGB', (260, 198), 'white')
            card.paste(image, ((260-image.width)//2, 6))
            draw = ImageDraw.Draw(card)
            draw.text((8, 165), f"#{item['index']}  {clean_text(item.get('caption'))[:30]}", fill='#111111')
            cards.append(card)
        except Exception:
            continue
    if not cards: return None
    columns = 4
    rows = (len(cards) + columns - 1) // columns
    sheet = Image.new('RGB', (columns * 260, rows * 198), '#e9edf0')
    for index, card in enumerate(cards): sheet.paste(card, ((index % columns)*260, (index // columns)*198))
    path = directory / f'{ident}.jpg'
    sheet.save(path, 'JPEG', quality=82, optimize=True)
    return str(path.relative_to(ROOT))

def create_photo_jobs(rows):
    from PIL import Image  # Fail early with a useful message if contact-sheet support is absent.
    del Image
    candidate_rows = {}
    for _run, row in rows:
        if not isinstance(row, dict) or row.get('id') is None: continue
        candidate_rows[str(row['id'])] = row
    eligible = []
    for ident, row in candidate_rows.items():
        coords = row.get('coordinates') if isinstance(row.get('coordinates'), dict) else {}
        zones = zone_list(coords.get('latitude'), coords.get('longitude'))
        if not zones or row.get('isAvailable') is False: continue
        if row.get('roomType') not in (None, 'Entire home/apt'): continue
        capacity = _int(row.get('personCapacity'))
        if capacity is not None and capacity < 5: continue
        quote = quote_for(row)
        if quote['total'] is not None and quote['total'] > 2500: continue
        eligible.append((candidate_score(row), ident, row))
    targets = read(PRIVATE / 'review-targets.json', []) or []
    target_order = {str(item.get('id')): index for index, item in enumerate(targets)
                    if isinstance(item, dict) and item.get('id') is not None}
    eligible.sort(key=lambda item: (0, target_order[item[1]]) if item[1] in target_order
                  else (1, -item[0], item[1]))
    sheet_dir = PRIVATE / 'sheets'
    sheet_dir.mkdir(parents=True, exist_ok=True)
    jobs_dir = PRIVATE / 'jobs'
    jobs_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    # Each home's downloader bounds active HTTP requests to six and each file to 8 MiB.
    for start in range(0, min(40, len(eligible)), 5):
        batch = []
        for rank, (_score, ident, row) in enumerate(eligible[start:start + 5], start=start):
            images = select_photo_evidence(structured_evidence(row)['images'])
            photo_results = [read_cached_photo(item, ident) for item in images]
            missing = [index for index, cached in enumerate(photo_results) if cached is None]
            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as downloads:
                fetched = list(downloads.map(download_photo, [images[index] for index in missing]))
            for index, result in zip(missing, fetched): photo_results[index] = result
            photo_results = [x for x in photo_results if x]
            home_photo_dir = PRIVATE / 'photos' / ident
            home_photo_dir.mkdir(parents=True, exist_ok=True)
            photo_paths = []
            extension_by_mime = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'}
            for item, data, mime in photo_results:
                local_path = home_photo_dir / f"{item['index']}.{extension_by_mime[mime]}"
                local_path.write_bytes(data)
                photo_paths.append({'index': item['index'], 'path': str(local_path.relative_to(ROOT)),
                                    'caption': item.get('caption', '')})
            sheet_path = make_contact_sheet(ident, photo_results, sheet_dir)
            evidence_path = PRIVATE / 'evidence' / f'{ident}.json'
            evidence = read(evidence_path, {})
            batch.append({'id': ident, 'inputHash': evidence.get('inputHash', ''),
                          'evidence': evidence, 'sheetPaths': [sheet_path] if sheet_path else [],
                          'photos': photo_paths, 'deepReview': rank < 10,
                          'outputPath': str((PRIVATE / 'enrichment' / f'{ident}.json').relative_to(ROOT))})
        job = {
            'model': 'gpt-6-luna',
            'allowedFactKeys': list(FACT_TYPES),
            'photoFactRules': [
                'Only report positive visible evidence; never assert false or absence from a photo.',
                'Photo counts are lower bounds: numeric photo facts require extent="at-least".',
                'Do not infer a maximum count from partial or obscured views.',
                'Use original zero-based photoIndices shown on contact sheets.',
            ],
            'homes': batch,
        }
        job_path = jobs_dir / f'job-{len(outputs)+1:03d}.json'
        write(job_path, job)
        outputs.append({'path': str(job_path.relative_to(ROOT)), 'ids': [h['id'] for h in batch]})
        print(json.dumps({'jobReady': str(job_path.relative_to(ROOT)), 'sheetPaths': [s for h in batch for s in h['sheetPaths']]}), flush=True)
    write(jobs_dir / 'index.json', {'jobs': outputs, 'candidateCount': len(eligible), 'selectedCount': min(40, len(eligible))})
    print(json.dumps({'selectedHomes': min(40, len(eligible)), 'jobs': len(outputs), 'index': str((jobs_dir / 'index.json').relative_to(ROOT))}))

def detail_for(row, facts, enrichment):
    desc = clean_text(row.get('description'))[:1800]
    am = [{'title': n, 'available': a, 'subtitle': s}
          for n, s, a in amenities_flat(row) if isinstance(a, bool)]
    policies = row.get('cancellationPolicies') or []
    cancellation = [clean_text(x.get('description') if isinstance(x, dict) else x) for x in policies]
    rules_obj = row.get('houseRules') or {}
    if isinstance(rules_obj, dict):
        rules = [clean_text(v.get('title') if isinstance(v, dict) else v)
                 for v in rules_obj.values() if isinstance(v, (str, dict))]
    elif isinstance(rules_obj, list): rules = [clean_text(x) for x in rules_obj]
    else: rules = []
    result = {'description': desc, 'amenities': am, 'cancellation': [x for x in cancellation if x],
              'rules': [x for x in rules if x], 'facts': facts}
    if enrichment: result['enrichment'] = enrichment
    return result

FACT_TYPES = {
    'properBeds': 'number', 'bedrooms': 'number', 'areaM2': 'number', 'toilets': 'number',
    'showers': 'number', 'showerLayout': 'enum', 'lift': 'boolean', 'floor': 'number',
    'entranceSteps': 'number', 'internalStairs': 'boolean', 'accessSuitable': 'boolean',
    'diningSeats': 'number', 'kitchen': 'boolean', 'dishwasher': 'boolean', 'oven': 'boolean',
    'hob': 'boolean', 'fridge': 'boolean', 'washingMachine': 'boolean', 'airConditioning': 'boolean',
    'wifi': 'boolean', 'cancellation': 'enum', 'kitchenQuality': 'enum',
    'tableImpression': 'enum', 'bedLayout': 'string',
}
FACT_ENUMS = {
    'showerLayout': {'separate', 'over-bath', 'both'},
    'cancellation': {'flexible', 'limited'},
    'kitchenQuality': {'modern', 'functional', 'dated'},
    'tableImpression': {'spacious', 'compact'},
}

def evidence_fragments(value):
    """Extract exact quoted text, or exact fragments split by the supported separators."""
    if not isinstance(value, str): return []
    quoted = re.findall(r'“([^”]+)”|"([^"]+)"', value)
    if quoted:
        pieces = [left or right for left, right in quoted]
    else:
        pieces = re.split(r'\s*;\s*|\s*\[\s*(?:…|\.\.\.)\s*\]\s*', value)
    return [clean_text(piece).casefold() for piece in pieces if len(clean_text(piece)) > 2]

def literal_evidence_supported(value, sources):
    pieces = evidence_fragments(value)
    return bool(pieces) and all(any(piece in source for source in sources) for piece in pieces)

def validate_enrichment(enrichment, input_hash, images, evidence, reviews, expected_id, errors):
    def record_error(key, reason): errors.append({'id': expected_id, 'key': key, 'reason': reason})
    if not isinstance(enrichment, dict): return None
    if enrichment.get('id') is not None and str(enrichment.get('id')) != expected_id:
        record_error('$record', 'enrichment id does not match the listing file')
        return None
    if enrichment.get('model') != 'gpt-6-luna' or enrichment.get('inputHash') != input_hash:
        record_error('$record', 'model or inputHash provenance mismatch')
        return None
    if not isinstance(enrichment.get('reviewedAt'), str) or not enrichment['reviewedAt']:
        record_error('$record', 'missing reviewedAt provenance')
        return None
    image_indices = {im['index'] for im in images}
    review_ids = {str(rv.get('id')) for rv in reviews if rv.get('id')}
    source_text = [evidence.get('description', '')]
    source_text.extend(f"{a.get('title', '')} {a.get('subtitle', '')}" for a in evidence.get('amenities', []))
    sub = evidence.get('subDescription') or {}
    source_text.extend(str(item) for item in sub.get('items', []) if isinstance(item, str))
    normalized_source = [clean_text(text).casefold() for text in source_text if text]

    photo_review = enrichment.get('photoReview')
    viewed = set()
    if photo_review is not None:
        if not isinstance(photo_review, dict):
            record_error('photoReview', 'photoReview must be an object')
            return None
        viewed_raw = photo_review.get('viewedPhotoIndices')
        best = photo_review.get('bestPhotoIndex')
        if (not isinstance(viewed_raw, list) or any(isinstance(i, bool) or not isinstance(i, int) or i not in image_indices for i in viewed_raw) or
                isinstance(best, bool) or (best is not None and (not isinstance(best, int) or best not in viewed_raw))):
            record_error('photoReview', 'viewed or best photo index is outside the source images')
            return None
        viewed = set(viewed_raw)
        for field in ('kitchenPhotoIndices', 'bathroomPhotoIndices', 'bedPhotoIndices', 'accessPhotoIndices'):
            values = photo_review.get(field)
            if not isinstance(values, list) or any(isinstance(i, bool) or not isinstance(i, int) or i not in viewed for i in values):
                record_error('photoReview', f'{field} must refer only to viewed images')
                return None
        if (not isinstance(photo_review.get('bestPhotoReason'), str) or
                not isinstance(photo_review.get('issues'), list) or
                any(not isinstance(x, str) for x in photo_review.get('issues', []))):
            record_error('photoReview', 'bestPhotoReason or issues has an invalid shape')
            return None

    raw_facts = enrichment.get('facts')
    if not isinstance(raw_facts, dict):
        record_error('facts', 'facts must be an object')
        return None
    accepted_facts = {}
    for key, item in raw_facts.items():
        reason = None
        if key not in FACT_TYPES:
            reason = 'fact key is not in the supported domain contract'
        elif not isinstance(item, dict):
            reason = 'fact must be an object'
        else:
            kind, value = FACT_TYPES[key], item.get('value')
            if kind == 'boolean' and not isinstance(value, bool): reason = 'value must be boolean'
            elif kind == 'number' and (isinstance(value, bool) or not isinstance(value, (int, float))): reason = 'value must be numeric'
            elif kind == 'enum' and value not in FACT_ENUMS.get(key, set()): reason = 'value is outside the domain enum'
            elif kind == 'string' and (not isinstance(value, str) or not value.strip()): reason = 'value must be a non-empty string'
            elif item.get('source') not in ('listing', 'photos', 'reviews'): reason = 'source is invalid'
            elif item.get('confidence') not in ('high', 'medium', 'low'): reason = 'confidence is invalid'
            elif not isinstance(item.get('reviewedAt'), str) or not isinstance(item.get('evidence'), str) or not clean_text(item['evidence']): reason = 'missing reviewedAt or evidence'
            elif item.get('extent') is not None and item.get('extent') not in ('exact', 'at-least'): reason = 'extent is invalid'
            elif item.get('source') == 'listing' and not literal_evidence_supported(item['evidence'], normalized_source): reason = 'listing evidence is not a supported literal quote'
            elif item.get('source') == 'photos':
                indices = item.get('photoIndices')
                if isinstance(value, bool) and value is False: reason = 'photo evidence cannot establish absence'
                elif key in ('accessSuitable', 'areaM2'): reason = 'photo evidence cannot establish accessSuitable or exact property area'
                elif not isinstance(indices, list) or not indices or any(isinstance(i, bool) or not isinstance(i, int) or i not in viewed for i in indices): reason = 'photoIndices must refer only to viewed images'
                elif kind == 'number' and item.get('extent') != 'at-least': reason = 'visual counts must declare extent=at-least'
            elif item.get('source') == 'reviews':
                ids = item.get('reviewIds')
                if not isinstance(ids, list) or not ids or any(str(i) not in review_ids for i in ids): reason = 'reviewIds are not present in attached review evidence'
                elif not literal_evidence_supported(item['evidence'], [clean_text(rv.get('text', '')).casefold() for rv in reviews if str(rv.get('id')) in {str(i) for i in ids}]): reason = 'review evidence is not quoted from the cited reviews'
        if reason:
            errors.append({'id': expected_id, 'key': str(key), 'reason': reason})
        else:
            accepted_facts[key] = item

    review_summary = enrichment.get('reviewSummary')
    if review_summary is not None:
        if not isinstance(review_summary, dict) or isinstance(review_summary.get('sampleCount'), bool) or not isinstance(review_summary.get('sampleCount'), int):
            record_error('reviewSummary', 'sampleCount must be an integer')
            return None
        if review_summary['sampleCount'] < 0 or review_summary['sampleCount'] > len(reviews):
            record_error('reviewSummary', 'sampleCount is outside the attached review evidence count')
            return None
        if any(not isinstance(review_summary.get(field), list) or any(not isinstance(x, str) for x in review_summary[field])
               for field in ('themes', 'concerns', 'conflicts')):
            record_error('reviewSummary', 'themes, concerns, and conflicts must be string arrays')
            enrichment = dict(enrichment)
            enrichment.pop('reviewSummary', None)

    enrichment = dict(enrichment)
    enrichment['facts'] = accepted_facts
    summary = enrichment.get('summary')
    if not isinstance(summary, str) or len(clean_text(summary)) > 360:
        errors.append({'id': expected_id, 'key': 'summary', 'reason': 'summary must be a short string'})
        enrichment['summary'] = ''
    deep_review = enrichment.get('deepReview')
    if deep_review is not None:
        indices = deep_review.get('photoIndices') if isinstance(deep_review, dict) else None
        if (not isinstance(deep_review, dict) or not isinstance(deep_review.get('reviewedAt'), str) or
                not isinstance(deep_review.get('note'), str) or not isinstance(indices, list) or
                any(isinstance(i, bool) or not isinstance(i, int) or i not in viewed for i in indices)):
            record_error('deepReview', 'deepReview photo indices or fields lack viewed-photo provenance')
            return None
    return enrichment

def normalize(rows, runs, reviews_by_listing=None, validation_errors=None):
    reviews_by_listing = reviews_by_listing or {}
    validation_errors = validation_errors if validation_errors is not None else []
    raw_rows = [row for _run, row in rows]
    stays = []
    latest_by_id = {}
    for run, row in rows:
        if isinstance(row, dict) and row.get('id') is not None:
            latest_by_id[str(row['id'])] = (run, row)
    # Keep first seen order, latest duplicate row as its more complete form.
    order = list(dict.fromkeys(str(r['id']) for r in raw_rows if isinstance(r, dict) and r.get('id') is not None))
    for ident in order:
        run, row = latest_by_id[ident]
        coords = row.get('coordinates') if isinstance(row.get('coordinates'), dict) else {}
        lat, lon = coords.get('latitude'), coords.get('longitude')
        sub = row.get('subDescription') if isinstance(row.get('subDescription'), dict) else {}
        subitems = [clean_text(v) for v in (sub.get('items') or [])]
        cap = _int(row.get('personCapacity'))
        bedrooms = next((_int(m.group(1)) for s in subitems if (m := re.search(r'(\d+)\s+bedrooms?', s, re.I))), None)
        advertised_beds = next((_number(m.group(1)) for s in subitems if (m := re.search(r'(\d+(?:[.,]\d+)?)\s+beds?\b', s, re.I))), None)
        rb = row.get('rating') if isinstance(row.get('rating'), dict) else {}
        reviewed = row.get('timestamp') if isinstance(row.get('timestamp'), str) else ''
        evidence = structured_evidence(row)
        reviews = list(reviews_by_listing.get(ident) or review_evidence(row))
        input_hash = hash_evidence(evidence, reviews)
        facts = listing_facts(row)
        enrichment_path = PRIVATE / 'enrichment' / f'{ident}.json'
        enrichment = read(enrichment_path)
        enrichment = validate_enrichment(enrichment, input_hash, evidence['images'], evidence, reviews, ident, validation_errors)
        stay = {
            'id': ident, 'title': clean_text(row.get('title')), 'url': row.get('url') or '',
            'lat': lat if isinstance(lat, (int, float)) else None, 'lon': lon if isinstance(lon, (int, float)) else None,
            'zones': zone_list(lat, lon), 'capacity': cap,
            'entireHome': True if row.get('roomType') == 'Entire home/apt' else (False if row.get('roomType') else None),
            'advertisedBeds': advertised_beds, 'bedrooms': bedrooms,
            'bathrooms': next((_number(m.group(1)) for s in subitems if (m := re.search(r'(\d+(?:[.,]\d+)?)\s+bathrooms?\b', s, re.I))), None),
            'rating': rb.get('guestSatisfaction') if isinstance(rb.get('guestSatisfaction'), (int, float)) else None,
            'reviewCount': _int(rb.get('reviewsCount')),
            'photos': [{'url': im['url'], 'caption': im['caption']} for im in evidence['images']],
            'quote': quote_for(row), 'facts': facts,
            'summary': (enrichment.get('summary', '') if enrichment else '') or card_summary(row.get('description')),
            'inputHash': input_hash,
        }
        if enrichment: stay['enrichment'] = enrichment
        stays.append(stay)
        private_evidence = {'id': ident, 'inputHash': input_hash, 'title': stay['title'], **evidence, 'reviews': reviews}
        write(PRIVATE / 'evidence' / f'{ident}.json', private_evidence)
        write(PUBLIC / 'details' / f'{ident}.json', detail_for(row, facts, enrichment))
    timestamp = max((r.get('finishedAt') or r.get('startedAt') or '' for r in runs
                     if r.get('phase') in ('discovery', 'details') and r.get('count', 0)), default='')
    trip = {'checkIn': CHECK_IN, 'checkOut': CHECK_OUT, 'nights': 4, 'adults': ADULTS, 'currency': CURRENCY, 'budget': 2500}
    review_runs = [r for r in runs if r.get('phase') == 'reviews']
    review_count = sum(int(r.get('count', 0) or 0) for r in review_runs)
    reviewed_homes = len(reviews_by_listing)
    empty_reviews = [r.get('label', 'unnamed review run') for r in review_runs if int(r.get('count', 0) or 0) == 0]
    coverage_parts = [f"{len(stays)} deduplicated listing rows; {sum(bool(s['zones']) for s in stays)} in-area"]
    if review_runs:
        coverage_parts.append(f"{review_count} collected reviews joined to {reviewed_homes} listings")
        if empty_reviews: coverage_parts.append(f"zero-row review coverage: {', '.join(empty_reviews)}")
    quote_runs = [r for r in runs if r.get('phase') == 'verification']
    if quote_runs:
        quote_count = sum(int(r.get('count', 0) or 0) for r in quote_runs)
        coverage_parts.append(f"{quote_count} rows from direct quote rechecks; original discovery quotes retained where rechecks returned no data")
    meta = {'collectedAt': timestamp, 'rawRows': len(raw_rows), 'uniqueListings': len(stays),
            'inAreas': sum(bool(s['zones']) for s in stays), 'chargedUsd': round(sum(float(r.get('charged', 0) or 0) for r in runs), 4),
            'coverage': '; '.join(coverage_parts),
            'searches': [{'label': (f"reviews: {r.get('label', '')}" if r.get('phase') == 'reviews' else r.get('label', '')),
                          'count': int(r.get('count', 0) or 0)} for r in runs], 'trip': trip}
    return {'meta': meta, 'stays': stays}

def card_summary(description):
    text = clean_text(description)
    if len(text) <= 200: return text
    cut = text[:200]
    if ' ' in cut: cut = cut.rsplit(' ', 1)[0]
    return cut.rstrip(' ,;:-')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--photos', action='store_true', help='prepare photo review jobs (requires collection to be ready)')
    args = parser.parse_args()
    runs = read(PRIVATE / 'runs.json', []) or []
    rows = []
    review_rows = []
    for run in runs:
        if not run.get('downloaded') or not run.get('id'): continue
        # Review actor rows have an inspected separate contract and join by /rooms/<id>.
        path = PRIVATE / f"{run['id']}.json"
        data = read(path, [])
        if isinstance(data, list):
            if run.get('phase') == 'reviews':
                review_rows.extend(data)
            else:
                rows.extend((run, row) for row in data)
    reviews_by_listing = normalize_review_actor_rows(review_rows)
    validation_errors = []
    snapshot = normalize(rows, runs, reviews_by_listing, validation_errors)
    write(PUBLIC / 'search.json', snapshot)
    write(PRIVATE / 'validation-errors.json', validation_errors)
    if args.photos:
        create_photo_jobs(rows)
    print(json.dumps({'rawRows': snapshot['meta']['rawRows'], 'uniqueListings': snapshot['meta']['uniqueListings'],
                      'inAreas': snapshot['meta']['inAreas'], 'search': str(PUBLIC / 'search.json')}))

if __name__ == '__main__': main()
