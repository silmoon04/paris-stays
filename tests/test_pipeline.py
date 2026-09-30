"""No network calls: test booking evidence and shared collection reservations."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT/'scripts'/f'{name}.py')
    result = importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result
p, c = module('prepare'), module('collect')

def row():
    return {'id':'123', 'url':'https://www.airbnb.com/rooms/123?check_in=2026-10-31&check_out=2026-11-04&adults=5&currency=GBP',
        'checkIn':'2026-10-31','checkOut':'2026-11-04','isAvailable':True,
        'price':{'breakDown':{'total':{'price':'£1,250.51'},'taxes':{'price':'£65.50'}}},
        'subDescription':{'items':['5 guests','4 bedrooms','6 beds','1.5 bathrooms']},
        'description':'Four bedrooms, including two proper beds. Kitchen. Two WCs.',
        'images':[{'imageUrl':'https://a0.muscache.com/a.jpg','caption':'Bathroom'}]}

class EvidenceTests(unittest.TestCase):
    def test_text_layout_deduplicates_rooms_and_excludes_sofas(self):
        r=row();r['description']='Bedroom 1: one queen size bed. Bedroom 2: two single beds. Living room: a sofa bed. Bedroom 1: one queen size bed. Bedroom 2: two single beds.'
        r['subDescription']['items']=['5 guests','2 bedrooms','4 beds','2 bathrooms']
        beds=p.text_facts(r)['properBeds'];self.assertEqual(beds['value'],3);self.assertEqual(beds['extent'],'exact')
        self.assertTrue(beds['inferred'])
        r['description']='Three bedrooms, each with a queen-size bed. A sofa bed in the lounge.'
        self.assertEqual(p.text_facts(r)['properBeds']['value'],3)
        r['description']='Three bedrooms with quality bedding. Four beds advertised.'
        self.assertNotIn('properBeds',p.text_facts(r))
        r['description']='Bedroom 1: one king-size bed (or two twin beds). Bedroom 2: one double bed.'
        self.assertEqual(p.text_facts(r)['properBeds']['value'],2)
        r['description']='Upstairs you will find two additional bedrooms. On the ground floor, a queen-size bed.'
        fs=p.text_facts(r);self.assertNotIn('floor',fs);self.assertFalse(fs['accessSuitable']['value'])

    def test_access_text_and_toilets_do_not_use_bathroom_count(self):
        r=row();r['description']='On the 4th floor without an elevator. Two bathrooms.'
        fs=p.text_facts(r);self.assertFalse(fs['accessSuitable']['value']);self.assertFalse(fs['lift']['value'])
        self.assertNotIn('toilets',fs)
        r['description']='On the 3rd floor with elevator. Two separate toilets. No stairs inside the apartment.'
        fs=p.text_facts(r);self.assertTrue(fs['lift']['value']);self.assertEqual(fs['floor']['value'],3)
        self.assertFalse(fs['internalStairs']['value']);self.assertEqual(fs['toilets']['value'],2)

    def test_review_excerpts_are_literal_short_and_have_no_guest_identity(self):
        reviews=[{'id':'1','text':'Lovely apartment. '+('A pleasant stay. '*30)+'There was noise at night from the street.','date':'2026-09-01','rating':4,'reviewer':{'name':'Private person'}}]
        snippets=p.review_snippets(reviews);self.assertEqual(len(snippets),1)
        self.assertLessEqual(len(snippets[0]['text'].split()),22)
        self.assertIn(snippets[0]['text'].strip('…'), reviews[0]['text'])
        self.assertNotIn('reviewer',json.dumps(snippets));self.assertNotIn('Private person',json.dumps(snippets))

    def test_tax_inclusive_total_and_context(self):
        r=row();q=p.quote_for(r);self.assertTrue(q['complete']);self.assertEqual(q['total'],1250.51)
        del r['price']['breakDown']['taxes'];self.assertFalse(p.quote_for(r)['complete'])
        r['adults']=4;self.assertIsNone(p.quote_for(r)['total'])
        r=row();r['currency']='EUR';self.assertFalse(p.quote_for(r)['complete'])
        r=row();r['checkOut']='2026-11-05';self.assertFalse(p.quote_for(r)['complete'])

    def test_before_taxes_never_becomes_total(self):
        r=row();r['price']['breakDown']['totalBeforeTaxes']=r['price']['breakDown'].pop('total')
        self.assertIsNone(p.quote_for(r)['total'])

    def test_bedrooms_and_decimal_bathrooms(self):
        r=row()
        with tempfile.TemporaryDirectory() as tmp, patch.object(p,'PRIVATE',Path(tmp)/'private'),patch.object(p,'PUBLIC',Path(tmp)/'public'):
            s=p.normalize([({},r)],[])['stays'][0]
            self.assertEqual(s['advertisedBeds'],6);self.assertEqual(s['bathrooms'],1.5)
            self.assertNotIn('properBeds',s['facts'])

    def test_reject_bad_fact_without_losing_valid_photo_review(self):
        r=row();ev=p.structured_evidence(r);hash_=p.hash_evidence(ev,[])
        base={'value':True,'source':'listing','confidence':'high','reviewedAt':'2026-09-30T00:00:00Z'}
        e={'model':'gpt-6-luna','inputHash':hash_,'reviewedAt':base['reviewedAt'],'summary':'Test',
            'facts':{'kitchen':{**base,'evidence':'Kitchen'},'accessSuitable':{**base,'evidence':'A completely step-free home'}},
            'photoReview':{'viewedPhotoIndices':[0],'bestPhotoIndex':0,'bestPhotoReason':'Visible bathroom',
                'kitchenPhotoIndices':[],'bathroomPhotoIndices':[0],'bedPhotoIndices':[],'accessPhotoIndices':[],'issues':[]}}
        errors=[];v=p.validate_enrichment(e,hash_,ev['images'],ev,[],'123',errors)
        self.assertIn('kitchen',v['facts']);self.assertNotIn('accessSuitable',v['facts']);self.assertEqual(len(errors),1)
        bad=copy.deepcopy(e);bad['photoReview']['bestPhotoIndex']=1
        self.assertIsNone(p.validate_enrichment(bad,hash_,ev['images'],ev,[],'123',[]))
        self.assertIsNone(p.validate_enrichment(e,'changed-hash',ev['images'],ev,[],'123',[]))
        photo=copy.deepcopy(e);photo['facts']={'toilets':{**base,'source':'photos','value':2,'evidence':'Two angles of a WC','photoIndices':[0]}}
        self.assertEqual(p.validate_enrichment(photo,hash_,ev['images'],ev,[],'123',[])['facts'],{})

    def test_photo_counts_are_discarded_even_with_valid_lower_bound_provenance(self):
        r=row();ev=p.structured_evidence(r);hash_=p.hash_evidence(ev,[])
        photo={'source':'photos','confidence':'high','value':3,'extent':'at-least','evidence':'Three bathroom views',
               'photoIndices':[0],'reviewedAt':'2026-09-30T00:00:00Z'}
        e={'model':'gpt-6-luna','inputHash':hash_,'reviewedAt':photo['reviewedAt'],
           'summary':'Photos show three WCs. Bright kitchen.',
           'facts':{'toilets':photo,'showers':photo,'showerLayout':{**photo,'value':'over-bath'}},
           'photoReview':{'viewedPhotoIndices':[0],'bestPhotoIndex':0,'bestPhotoReason':'Bathroom view',
               'kitchenPhotoIndices':[],'bathroomPhotoIndices':[0],'bedPhotoIndices':[],'accessPhotoIndices':[],'issues':[]},
           'deepReview':{'reviewedAt':photo['reviewedAt'],'photoIndices':[0],'note':'Two photographed shower rooms. A bathtub edge is visible.'}}
        errors=[];result=p.validate_enrichment(e,hash_,ev['images'],ev,[],'123',errors)
        self.assertEqual(set(result['facts']),{'showerLayout'})
        self.assertEqual(errors,[])
        self.assertEqual(result['summary'],'Bright kitchen.')
        self.assertEqual(result['deepReview']['note'],'A bathtub edge is visible.')
        self.assertEqual(result['photoReview']['bathroomPhotoIndices'],[0])

    def test_ai_prose_removes_bathroom_counts_without_removing_qualitative_observations(self):
        text='Photos show two WCs and one distinct shower. Separate bathroom rooms each show a WC. The kitchen is fitted. A tiled shower room is visible.'
        self.assertEqual(p.without_bathroom_count_claims(text),'The kitchen is fitted. A tiled shower room is visible.')
        self.assertEqual(p.without_bathroom_count_claims('Four bedroom beds, a table with six chairs and a tiled shower room are visible.'),
                         'Four bedroom beds, a table with six chairs and a tiled shower room are visible.')
        self.assertFalse(p.supported_bathroom_count({'source':'listing','confidence':'low','value':3}))
        self.assertFalse(p.supported_bathroom_count({'source':'reviews','confidence':'high','value':3}))
        self.assertTrue(p.supported_bathroom_count({'source':'listing','confidence':'high','value':3}))

class BudgetTests(unittest.TestCase):
    def test_phase_and_all_keys_share_one_cap(self):
        runs=[{'phase':'discovery','cap':2.5,'charged':2.3,'key':'key1'},{'phase':'reviews','cap':1.5,'charged':1.4,'key':'key2'},
            {'phase':'details','cap':.5,'charged':.5},{'phase':'verification','cap':.5,'charged':.5}]
        self.assertEqual(c.remaining(runs),.3);self.assertEqual(c.remaining(runs,'discovery'),.2)
        with tempfile.TemporaryDirectory() as tmp,patch.object(c,'PRIVATE',Path(tmp)),patch.object(c,'api') as network:
            c.write(Path(tmp)/'runs.json',[{**r,'downloaded':True} for r in runs])
            with self.assertRaises(ValueError):c.start('actor',{},'discovery',.21,'cap test')
            with self.assertRaises(ValueError):c.start('actor',{},'verification',float('nan'),'cap test')
            network.assert_not_called()

    def test_uncertain_submission_stays_reserved_and_is_not_retried(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(c,'PRIVATE',Path(tmp)),patch.object(c,'api',side_effect=OSError('uncertain')) as network:
            with self.assertRaises(OSError):c.start('actor',{},'discovery',.1,'pilot')
            runs=c.read(Path(tmp)/'runs.json');self.assertEqual(c.remaining(runs),4.9)
            with self.assertRaises(ValueError):c.start('actor',{},'discovery',.1,'retry')
            self.assertEqual(network.call_count,1)

if __name__=='__main__':unittest.main()
