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
