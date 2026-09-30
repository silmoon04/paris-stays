"""Budgeted Apify collection; credentials never enter generated artifacts."""
import argparse, json, os, re, time, math, urllib.request, urllib.parse
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
PRIVATE=ROOT/'.private'
PHASES={'discovery':2.50,'details':.50,'reviews':1.50,'verification':.50}
TERMINAL={'SUCCEEDED','FAILED','ABORTED','TIMED-OUT'}

@contextmanager
def ledger_lock():
    PRIVATE.mkdir(parents=True, exist_ok=True)
    with (PRIVATE/'collection.lock').open('a+b') as handle:
        handle.seek(0);handle.write(b'0');handle.flush();handle.seek(0)
        if os.name=='nt':
            import msvcrt
            try: msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
            except OSError: raise ValueError('Another collection process owns the shared budget ledger')
        else:
            import fcntl
            try: fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except OSError: raise ValueError('Another collection process owns the shared budget ledger')
        try: yield
        finally:
            handle.seek(0)
            if os.name=='nt': msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1)
            else: fcntl.flock(handle,fcntl.LOCK_UN)

def exclusive(function):
    @wraps(function)
    def wrapped(*args,**kwargs):
        with ledger_lock(): return function(*args,**kwargs)
    return wrapped

def read(path, default=None):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else default
def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(path)
def token():
    if os.environ.get('APIFY_TOKEN'): return os.environ['APIFY_TOKEN']
    values=dict(re.findall(r'^\s*(APIFY_KEY_\d+)\s*=\s*(.*?)\s*$',(ROOT.parent/'.env').read_text(),re.M))
    return values['APIFY_KEY_1'].strip('"\'')
def api(path,body=None,raw=False):
    req=urllib.request.Request('https://api.apify.com/v2/'+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+token(),'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=55) as response:
        return response.read().decode() if raw else json.load(response)
def remaining(runs,phase=None):
    spent=sum(r.get('charged',r['cap']) for r in runs if phase is None or r['phase']==phase)
    return round((5 if phase is None else PHASES[phase])-spent,6)
@exclusive
def start(actor,body,phase,cap,label):
    PRIVATE.mkdir(exist_ok=True)
    runs=read(PRIVATE/'runs.json',[])
    if phase not in PHASES or not math.isfinite(cap) or cap<=0 or cap>remaining(runs)+1e-8 or cap>remaining(runs,phase)+1e-8: raise ValueError('Collection cap would be exceeded')
    # Runs are sequential. An unresolved reservation must never be spent again.
    if any(not r.get('downloaded') for r in runs): raise ValueError('Reconcile the preceding run before starting another')
    pending={'phase':phase,'cap':cap,'label':label,'actor':actor,'status':'SUBMITTING','input':body,'startedAt':datetime.now(timezone.utc).isoformat()}
    runs.append(pending);write(PRIVATE/'runs.json',runs)
    # A network-uncertain submission retains its reservation; never auto-resubmit.
    result=api(f'acts/{actor}/runs?maxTotalChargeUsd={cap}&timeout=600',body)['data']
    pending.update(id=result['id'],dataset=result['defaultDatasetId'],status=result['status'])
    write(PRIVATE/'runs.json',runs)
    print(json.dumps({k:pending[k] for k in ['id','phase','cap','label','status']}),flush=True)
    return pending
@exclusive
def fetch():
    runs=read(PRIVATE/'runs.json',[])
    for run in runs:
        if run.get('downloaded'): continue
        if not run.get('id'): raise ValueError('Uncertain submission needs reconciliation; its budget remains reserved')
        state=api('actor-runs/'+run['id'])['data'];run['status']=state['status']
        if state['status'] in TERMINAL:
            run['charged']=state.get('usageTotalUsd') if state.get('usageTotalUsd') is not None else run['cap']
            items=api('datasets/'+run['dataset']+'/items?clean=true&limit=10000')
            write(PRIVATE/(run['id']+'.json'),items)
            run.update(count=len(items),downloaded=True,finishedAt=state.get('finishedAt'))
        print(json.dumps({k:v for k,v in run.items() if k not in ['input','dataset']}),flush=True)
    write(PRIVATE/'runs.json',runs)
    print(json.dumps({'remainingUsd':remaining(runs),'phases':{p:remaining(runs,p) for p in PHASES}}),flush=True)
    return runs
def search_url(zone):
    bounds={'west':(48.878,2.345,48.857,2.316),'east':(48.872,2.362,48.855,2.340)}[zone]
    ne_lat,ne_lng,sw_lat,sw_lng=bounds
    params={'checkin':'2026-10-31','checkout':'2026-11-04','adults':5,'min_beds':4,'room_types[]':'Entire home/apt','currency':'GBP','search_by_map':'true','ne_lat':ne_lat,'ne_lng':ne_lng,'sw_lat':sw_lat,'sw_lng':sw_lng,'zoom':15,'search_type':'filter_change'}
    return 'https://www.airbnb.co.uk/s/Paris--France/homes?'+urllib.parse.urlencode(params)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['search','fetch','run','log']);parser.add_argument('--zone',choices=['west','east']);parser.add_argument('--count',type=int,default=5);parser.add_argument('--cap',type=float,default=.10);parser.add_argument('--input');parser.add_argument('--phase',choices=PHASES,default='discovery');parser.add_argument('--actor',default='tri_angle~airbnb-scraper');parser.add_argument('--label',default='');args=parser.parse_args()
    if args.command=='search':
        body={'startUrls':[{'url':search_url(args.zone)}],'maxResults':args.count,'checkIn':'2026-10-31','checkOut':'2026-11-04','adults':5,'children':0,'infants':0,'pets':0,'currency':'GBP','locale':'en-GB','minBeds':4,'enrichUserProfiles':False}
        start(args.actor,body,'discovery',args.cap,args.label or args.zone)
    elif args.command=='run':start(args.actor,read(Path(args.input)),args.phase,args.cap,args.label)
    elif args.command=='fetch':fetch()
    else:
        runs=read(PRIVATE/'runs.json',[])
        if runs:
            result=api('actor-runs/'+runs[-1]['id'])['data']
            print(json.dumps({k:result.get(k) for k in ['status','statusMessage','usageTotalUsd']}))
if __name__=='__main__':main()
