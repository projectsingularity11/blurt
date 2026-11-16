import os
import urllib.request,urllib.parse,json,pathlib,re,time,concurrent.futures,html,hashlib
ROOT=pathlib.Path(os.environ.get('BLURT_CATALOG_DIR','.cache/blurt-catalog'));ROOT.mkdir(parents=True,exist_ok=True);UA='BLURT/3.0 (licensed picture game content; https://blurt-eight.vercel.app)'
def get(url):
 for attempt in range(4):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':UA});return json.load(urllib.request.urlopen(req,timeout=55))
  except Exception:
   if attempt==3:raise
   time.sleep(1+attempt)
if not (ROOT/'openmoji.json').exists():
 (ROOT/'openmoji.json').write_text(json.dumps(get('https://raw.githubusercontent.com/hfg-gmuend/openmoji/master/data/openmoji.json')))
files={'Animals':['animals/common','animals/birds_north_america','animals/birds_antarctica','animals/dinosaurs','animals/cats','animals/dogs','foods/fish','foods/shellfish'], 'Food':['foods/fruits','foods/vegetables','foods/herbs_n_spices','foods/breads_and_pastries','foods/condiments','foods/sausages','foods/tea','foods/poultry'], 'Objects':['objects/objects','objects/clothing','objects/containers','technology/appliances','technology/knots'], 'Nature':['plants/flowers','plants/plants','plants/toxic_plants','geography/geographic_features']}
candidates={}
def walk(x):
 if isinstance(x,str):yield x
 elif isinstance(x,list):
  for y in x:yield from walk(y)
 elif isinstance(x,dict):
  for k,y in x.items():
   if k not in ['description','source','url','license','instructions']:yield from walk(y)
for cat,paths in files.items():
 for name in paths:
  try:
   cached=ROOT/(name.replace('/','-')+'.json')
   raw=json.load(open(cached)) if cached.exists() else get('https://raw.githubusercontent.com/dariusk/corpora/master/data/'+name+'.json')
   (ROOT/(name.replace('/','-')+'.json')).write_text(json.dumps(raw))
   for s in walk(raw):
    if 2<=len(s)<=45 and not re.search(r'https?://|[\d\n{}<>]|\band\b|\bor\b',s) and len(s.split())<=5:candidates.setdefault(s.lower(),cat)
  except Exception as e:print('source skip',name,str(e)[:80],flush=True)
for p in json.load(open(ROOT/'openmoji.json')):
 cat={'animals-nature':'Animals','food-drink':'Food','objects':'Objects','travel-places':'Objects','activities':'Objects'}.get(p['group'])
 s=p['annotation']
 if cat and ':' not in s and len(s)<=40 and 'face' not in s and 'button' not in s:candidates.setdefault(s.lower(),cat)
extras='''accordion|acoustic guitar|airplane|alarm clock|alligator|alpaca|anchor|anvil|apricot|artichoke|asparagus|asteroid|avocado|axe|backpack|badger|bagel|bagpipe|baklava|bamboo|banjo|barrel|bassoon|beaker|beetroot|bell pepper|binoculars|blackberry|blueberry|bonsai|bowling ball|box turtle|brussels sprout|bulldozer|butterfly|cabbage|cactus|camel|cantaloupe|carrot|castle|cauliflower|cello|chainsaw|cheetah|cherry|chestnut|chickpea|chili pepper|chinchilla|chisel|clarinet|clementine|coconut|colander|compass|corkscrew|corn|cranberry|croissant|cucumber|daffodil|daisy|dandelion|date palm|daikon|dragon fruit|drill|durian|eggplant|electric guitar|escalator|excavator|fennel|fig|fire hydrant|fire extinguisher|flamingo|flute|forklift|fountain|French horn|galangal|garlic|giraffe|glockenspiel|gooseberry|grapefruit|green bean|guava|harmonica|harp|harpsichord|hedgehog|helicopter|hippopotamus|honeydew|hot air balloon|hourglass|hummingbird|iguana|jackfruit|jalapeno|jellyfish|kale|kayak|kettle|kohlrabi|kumquat|ladle|lantern|leek|lemon|lentil|lettuce|lighthouse|lime|lychee|mandolin|mango|mangosteen|marimba|melon|microscope|mongoose|mushroom|nectarine|oboe|okra|onion|organ|ostrich|otter|papaya|parsnip|passion fruit|peach|pear|pea|pelican|persimmon|piano|pistachio|plum|pomegranate|pomelo|potato|praying mantis|projector|pumpkin|quince|radish|rambutan|raspberry|rhinoceros|rhubarb|rice cooker|rolling pin|ruler|rutabaga|saffron|salamander|saxophone|scorpion|sculpture|sea cucumber|seahorse|shallot|sitar|sloth|snowplow|snowdrop|spatula|spinach|squash|star anise|starfruit|stethoscope|sugar apple|sunflower|sweet potato|tamarind|tambourine|tangerine|telescope|thermometer|timpani|tomato|trampoline|trombone|trumpet|tuba|turnip|ukulele|unicycle|vibraphone|viola|violin|walrus|watermelon|whisk|xylophone|yam|zebra|zucchini'''
for s in extras.split('|'):candidates.setdefault(s,'Objects')
(ROOT/'candidates.json').write_text(json.dumps(candidates));print('Candidates',len(candidates),flush=True)
# Query article lead images in batches; canonical redirects collapse synonyms.
found={};items=list(candidates)
for start in range(0,len(items),40):
 batch=items[start:start+40];cache=ROOT/f'wiki-{start}.json'
 try:
  data=json.load(open(cache)) if cache.exists() else get('https://en.wikipedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','formatversion':2,'titles':'|'.join(batch),'redirects':1,'prop':'pageimages|pageprops|extracts','piprop':'original','exintro':1,'explaintext':1,'exsentences':1}))
  cache.write_text(json.dumps(data))
  for p in data.get('query',{}).get('pages',[]):
   o=p.get('original',{});url=o.get('source','').split('?')[0]
   if not url.startswith('https://upload.wikimedia.org/wikipedia/commons/') or '/thumb/' in url:continue
   if not re.search(r'\.(jpe?g|png|webp)$',url,re.I) or min(o.get('width',0),o.get('height',0))<480:continue
   if 'disambiguation' in p.get('pageprops',{}):continue
   ex=p.get('extract','')
   if re.search(r'\b(born|surname|given name|American actor|American singer|British actor|novel by|studio album|rock band|film directed|television series|video game developed|software company)\b',ex,re.I):continue
   links={x['from']:x['to'] for x in data.get('query',{}).get('normalized',[])+data.get('query',{}).get('redirects',[])}
   def canonical(k):
    for _ in range(5):k=links.get(k,k)
    return k
   title=p['title'];name=re.sub(r'\s*\([^)]*\)','',title).lower();fn=urllib.parse.unquote(url.rsplit('/',1)[-1]);
   if name in found:continue
   # Assign source category; retain the canonical page as answer provenance.
   cat=next((candidates[k] for k in batch if canonical(k)==title),candidates.get(name,'Objects'))
   found[name]={'answer':name,'aliases':[],'category':cat,'article':title,'sourceUrl':'https://en.wikipedia.org/wiki/'+urllib.parse.quote(title.replace(' ','_')),'originalUrl':url,'file':fn,'width':o['width'],'height':o['height'],'summary':ex}
 except Exception as e:print('wiki skip',start,str(e)[:70],flush=True)
 if start%200==0:print('Wiki',start,'matched',len(found),flush=True)
(ROOT/'wiki-found.json').write_text(json.dumps(list(found.values()),ensure_ascii=False))
# Commons identifies creators and explicit licenses, supplies a manageable high-res thumbnail.
values=list(found.values());licensed=[];sha=set()
for start in range(0,len(values),40):
 batch=values[start:start+40];cache=ROOT/f'commons-{start}.json'
 try:
  data=json.load(open(cache)) if cache.exists() else get('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','formatversion':2,'titles':'|'.join('File:'+x['file'] for x in batch),'prop':'imageinfo','iiprop':'url|extmetadata|sha1|size','iiurlwidth':1280}))
  cache.write_text(json.dumps(data));lookup={x['title'].removeprefix('File:').replace('_',' '):x for x in data.get('query',{}).get('pages',[])}
  for p in batch:
   q=lookup.get(p['file'].replace('_',' '),{});info=q.get('imageinfo',[{}])[0];meta=info.get('extmetadata',{});lic=meta.get('LicenseShortName',{}).get('value','');h=info.get('sha1')
   if not h or h in sha or not re.match(r'^(CC BY(-SA)? [1-4]|CC0|Public domain|PDM)',lic,re.I):continue
   artist=html.unescape(re.sub('<[^>]*>','',meta.get('Artist',{}).get('value',''))).strip()
   if not artist or len(artist)>600:continue
   sha.add(h);p.update({'license':lic,'licenseUrl':meta.get('LicenseUrl',{}).get('value','https://commons.wikimedia.org/wiki/'+urllib.parse.quote('File:'+p['file'])),'author':artist,'sourceSha1':h,'downloadUrl':info.get('thumburl',info.get('url')),'sourceFileUrl':info.get('descriptionurl')});licensed.append(p)
 except Exception as e:print('commons skip',start,str(e)[:70],flush=True)
 if start%200==0:print('Commons',start,'licensed',len(licensed),flush=True)
(ROOT/'licensed.json').write_text(json.dumps(licensed,ensure_ascii=False));print('LICENSED',len(licensed),flush=True)
