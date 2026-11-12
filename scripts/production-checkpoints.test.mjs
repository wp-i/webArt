import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {engineeringCheckpointFile,writeEngineeringCheckpoint,readEngineeringCheckpoint} from './production/checkpoints.mjs';

test('completed engineering evidence can resume only with the exact source, plan binding and bytes',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-engineering-checkpoint-'));
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^webart-engineering-checkpoint-/);fs.rmSync(root,{recursive:true,force:true})});
 const directory='docs/evidence/qa',file='docs/checkpoint.json';fs.mkdirSync(path.join(root,directory),{recursive:true});
 fs.writeFileSync(path.join(root,directory,'runtime.json'),'complete runtime');fs.writeFileSync(path.join(root,directory,'frame.jpg'),'actual fixture frame');
 const bound={binding:'a'.repeat(64),sourceSha256:'b'.repeat(64)};
 const saved=writeEngineeringCheckpoint(root,file,{...bound,directory});assert.equal(saved.artifacts.length,2);
 assert.deepEqual(readEngineeringCheckpoint(root,file,bound),saved);
 assert.throws(()=>readEngineeringCheckpoint(root,file,{...bound,sourceSha256:'c'.repeat(64)}),/changed/);
 assert.throws(()=>readEngineeringCheckpoint(root,file,{...bound,binding:'c'.repeat(64)}),/changed/);
 assert.throws(()=>writeEngineeringCheckpoint(root,file,{...bound,directory}),/EEXIST/);
 fs.appendFileSync(path.join(root,directory,'frame.jpg'),'tamper');assert.throws(()=>readEngineeringCheckpoint(root,file,bound),/changed or empty evidence/);
});

test('a new inspector gets a fresh versioned checkpoint while exact-byte cache corruption still stops',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-engineering-checkpoint-'));
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^webart-engineering-checkpoint-/);fs.rmSync(root,{recursive:true,force:true})});
 const directory='docs/evidence/qa',file='docs/checkpoint.json';fs.mkdirSync(path.join(root,directory),{recursive:true});fs.writeFileSync(path.join(root,directory,'frame.jpg'),'first actual frame');
 const first={binding:'a'.repeat(64),sourceSha256:'b'.repeat(64)},next={...first,binding:'c'.repeat(64)};
 assert.equal(engineeringCheckpointFile(root,file,first),file);
 writeEngineeringCheckpoint(root,file,{...first,directory});const frozen=fs.readFileSync(path.join(root,file));
 assert.equal(engineeringCheckpointFile(root,file,first),file);
 const nextFile=engineeringCheckpointFile(root,file,next);assert.equal(nextFile,'docs/checkpoint-'+next.binding+'.json');assert.equal(fs.existsSync(path.join(root,nextFile)),false);
 const fresh='docs/evidence/qa-attempt-02';fs.mkdirSync(path.join(root,fresh));fs.writeFileSync(path.join(root,fresh,'frame.jpg'),'new inspector actual frame');
 writeEngineeringCheckpoint(root,nextFile,{...next,directory:fresh});assert.equal(engineeringCheckpointFile(root,file,next),nextFile);assert.deepEqual(fs.readFileSync(path.join(root,file)),frozen);
 fs.appendFileSync(path.join(root,fresh,'frame.jpg'),'tampered');assert.throws(()=>engineeringCheckpointFile(root,file,next),/changed or empty evidence/);
 fs.appendFileSync(path.join(root,directory,'frame.jpg'),'tampered');assert.throws(()=>engineeringCheckpointFile(root,file,first),/changed or empty evidence/);
});
