import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT,fingerprint} from './collection.mjs';
import {hash} from './production/api.mjs';
import {loadCohort} from './production/evidence.mjs';
import {loadStyleCohort} from './production/style-cohort.mjs';
import {ProductionRun} from './production/runner.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-style-cohort-'));
  t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('webart-style-cohort-'));fs.rmSync(root,{recursive:true,force:true})});
  const write=(file,value)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));return {path:file,sha256:hash(fs.readFileSync(target))}};
  const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const source=(id,directory)=>{
    const slug='work-'+id,files=['index.html','package.json','package-lock.json','README.md','THIRD_PARTY_NOTICES.md','src/main.js','public/assets/image.png'];
    for(const file of files)write(directory+'/'+file,file==='package.json'?{version:'1.0.0'}:'Controlled engineering source '+directory+'/'+file);
    const manifest=directory+'/manifest.json';write(manifest,{slug,version:'1.0.0',output:'public/'+slug+'-source.zip',files:files.map(archive=>({source:directory+'/'+archive,archive}))});
    const entry={id,slug,manifest};return {entry,sourceSha256:fingerprint(entry,root)};
  };
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCFkAAAAASUVORK5CYII=','base64');
  const states=(id,prefix,runtime=false)=>['desktop','mobile'].flatMap(viewport=>['opening','transition','middle','ending'].map(state=>{
    const evidence=write(prefix+'/'+viewport+'-'+state+'.png',image);
    return {viewport,state,...(runtime?{width:viewport==='desktop'?1440:390,height:viewport==='desktop'?900:844,evidence}:{evidence:[evidence]})};
  }));
  const ids=['001','006','007','008','009','010'],templates=[],frozenCohort=[],pages=[];
  for(const id of ids) {
    const old=source(id,'frozen/'+id),frames=states(id,'evidence/frozen-'+id).map(({viewport,state,evidence})=>({viewport,state,...evidence[0]}));
    templates.push(old.entry);frozenCohort.push({id,sourceSha256:old.sourceSha256,states:frames});pages.push({id,sourceSha256:old.sourceSha256,evidence:frames});
  }
  write('webart.collection.json',{schemaVersion:1,templates});
  write('docs/evidence/quality-calibration/capture.json',{result:'captured-not-scored',pages});
  const renderers={},shown=ids.map(id=>({id}));
  for(const id of ['006','010']) {
    const rendererId='new-'+id+'-v1',current=source(id,'renderers/'+rendererId+'/source'),runtime='evidence/current-'+id+'/runtime.json';
    write(runtime,{mode:'full',result:'passed-observable-checks',sourceSha256:current.sourceSha256,errors:[],responsive:states(id,'evidence/current-'+id,true)});
    const qualification=write('renderers/'+rendererId+'/qualification.json',{id,trialApproval:{sourceSha256:current.sourceSha256,runtime}});
    renderers[rendererId]={entry:current.entry,definition:{id:rendererId,templateId:id,sourceSha256:current.sourceSha256,qualification}};
    Object.assign(shown.find(item=>item.id===id),{rendererId,sourceSha256:current.sourceSha256});
  }
  const services={getShowcase:()=>shown,loadRenderer:(_,id)=>{assert.ok(renderers[id],'Unknown fixture renderer');return renderers[id]}};
  return {root,write,read,source,states,shown,renderers,frozenCohort,services,load:options=>loadStyleCohort(root,{candidateId:'009',frozenCohort,services,...options})};
}

test('actual style cohort selects the current woven006 and instrument010 while leaving frozen quality samples intact',()=>{
  const frozen=loadCohort(ROOT),before=JSON.stringify(frozen),styles=loadStyleCohort(ROOT,{candidateId:'009',frozenCohort:frozen});
  assert.deepEqual(styles.map(style=>style.id),['001','006','007','008','010']);
  for(const [id,rendererId]of [['006','ivory-woven-v1'],['010','pace-precision-v2']]) {
    const style=styles.find(item=>item.id===id);
    assert.equal(style.rendererId,rendererId);assert.equal(style.origin,'current-showcase');assert.notEqual(style.sourceSha256,frozen.find(item=>item.id===id).sourceSha256);
    assert.equal(style.states.length,8);assert.ok(style.states.every(frame=>!frame.path.includes('quality-calibration')));
    assert.equal(hash(fs.readFileSync(path.join(ROOT,style.capture.path))),style.capture.sha256);
  }
  for(const id of ['001','007','008']) {
    const style=styles.find(item=>item.id===id),old=frozen.find(item=>item.id===id);
    assert.equal(style.rendererId,null);assert.equal(style.origin,'frozen-showcase');assert.equal(style.sourceSha256,old.sourceSha256);
    assert.deepEqual(style.states,old.states.map(({viewport,state,path,sha256})=>({viewport,state,path,sha256})));
  }
  assert.equal(JSON.stringify(frozen),before);
});

test('candidate exclusion applies to current presentations and same-run deliveries',t=>{
  const f=fixture(t),styles=f.load({candidateId:'006',deliveries:[{id:'006',directory:'invalid-candidate-entry'}]});
  assert.ok(!styles.some(item=>item.id==='006'));assert.equal(styles.length,5);
});

test('a current renderer cannot reuse a stale source, qualification or runtime identity',async t=>{
  for(const mutation of ['showcase','source','qualification','runtime'])await t.test(mutation,t=>{
    const f=fixture(t),shown=f.shown.find(item=>item.id==='006'),renderer=f.renderers[shown.rendererId];
    if(mutation==='showcase')shown.sourceSha256='0'.repeat(64);
    if(mutation==='source')fs.appendFileSync(path.join(f.root,'renderers/new-006-v1/source/src/main.js'),' changed');
    if(mutation==='qualification') {
      const handoff=f.read(renderer.definition.qualification.path);handoff.trialApproval.sourceSha256='0'.repeat(64);
      renderer.definition.qualification=f.write(renderer.definition.qualification.path,handoff);
    }
    if(mutation==='runtime') {
      const runtime='evidence/current-006/runtime.json',report=f.read(runtime);report.sourceSha256='0'.repeat(64);f.write(runtime,report);
    }
    assert.throws(()=>f.load(),/source|changed/);
  });
});

test('changed, missing or incomplete current-state images are blocked',async t=>{
  for(const mutation of ['changed-image','missing-image','missing-state','wrong-width'])await t.test(mutation,t=>{
    const f=fixture(t),runtime='evidence/current-006/runtime.json',report=f.read(runtime),frame=report.responsive[0];
    if(mutation==='changed-image')fs.appendFileSync(path.join(f.root,frame.evidence.path),' changed');
    if(mutation==='missing-image')fs.unlinkSync(path.join(f.root,frame.evidence.path));
    if(mutation==='missing-state'){report.responsive.pop();f.write(runtime,report)}
    if(mutation==='wrong-width'){frame.width=320;f.write(runtime,report)}
    assert.throws(()=>f.load());
  });
});

test('unrevised styles require their exact frozen source and original capture membership',async t=>{
  for(const mutation of ['source','capture-source','foreign-frame'])await t.test(mutation,t=>{
    const f=fixture(t);
    if(mutation==='source')fs.appendFileSync(path.join(f.root,'frozen/007/src/main.js'),' changed');
    if(mutation==='capture-source') {
      const capture='docs/evidence/quality-calibration/capture.json',report=f.read(capture);report.pages.find(page=>page.id==='007').sourceSha256='0'.repeat(64);f.write(capture,report);
    }
    if(mutation==='foreign-frame')Object.assign(f.frozenCohort.find(item=>item.id==='007').states[0],f.write('evidence/foreign.png','verified bytes from another capture'));
    assert.throws(()=>f.load(),/frozen|Frozen/);
  });
});

test('earlier same-run delivery replaces its published version after verifying actual source and all states',t=>{
  const f=fixture(t),directory='.webart/prototypes/earlier-006',current=f.source('006',directory),capturePath='evidence/earlier-006/capture.json';
  f.write(capturePath,{result:'captured-not-scored',sourceSha256:current.sourceSha256,errors:[],states:f.states('006','evidence/earlier-006')});
  const delivery={id:'006',directory,capturePath,sourceSha256:current.sourceSha256},styles=f.load({deliveries:[delivery]}),style=styles.find(item=>item.id==='006');
  assert.equal(styles.filter(item=>item.id==='006').length,1);assert.equal(style.origin,'earlier-delivery');assert.equal(style.sourceSha256,current.sourceSha256);assert.equal(style.rendererId,null);assert.equal(style.capture.path,capturePath);assert.equal(style.states.length,8);
  assert.ok(!style.states.some(frame=>frame.path.includes('current-006')));
  const report=f.read(capturePath);report.sourceSha256='0'.repeat(64);f.write(capturePath,report);assert.throws(()=>f.load({deliveries:[delivery]}),/capture source/);
  report.sourceSha256=current.sourceSha256;f.write(capturePath,report);fs.appendFileSync(path.join(f.root,directory,'src/main.js'),' changed');assert.throws(()=>f.load({deliveries:[delivery]}),/delivery source changed/);
});

test('style gate records its actual cohort without inventing a review receipt',async()=>{
  const prototype=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/evidence/production/api-20261023020510668-730eef15/009-prototype-0-0/capture.json'),'utf8'));
  const result={decision:'distinct',nearestId:'006',openingAndAssetBothRepeated:false,comparisons:['composition','typography','color-media','rhythm'].map(dimension=>({dimension,different:true,finding:'Controlled engineering fixture only; this result does not grant real visual approval.'}))};
  let saved,request;
  const context={root:ROOT,plans:[],report:{deliveries:[]},stage:()=>{},client:{json:async value=>{request=value;return structuredClone(result)}},save:(name,value)=>{saved={name,value}}};
  assert.equal(await ProductionRun.prototype.checkStyle.call(context,{id:'009',style:{requiredDifferences:['composition','typography','color-media','rhythm']}},prototype,loadCohort(ROOT),prototype.sourceSha256),true);
  assert.equal(saved.name,'009-style-review.json');assert.equal(saved.value.sourceSha256,prototype.sourceSha256);assert.equal(saved.value.comparisonCohort.find(item=>item.id==='006').rendererId,'ivory-woven-v1');assert.equal(saved.value.reviewReceipt,undefined);
  assert.equal(request.images.filter(input=>input.type==='input_image').length,48);assert.ok(request.images.some(input=>input.type==='input_text'&&input.text.includes('006 mobile ending')));
});
