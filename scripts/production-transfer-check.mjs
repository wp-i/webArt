import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ROOT,child} from './collection.mjs';
import {hash} from './production/api.mjs';
import {storeTrialArchive} from './production/project.mjs';

const id=crypto.randomBytes(8).toString('hex'),temporary=path.join(os.tmpdir(),'webart-transfer-'+id+'.zip'),archivePath='.webart/trials/api-transfer-'+id+'-source.zip',destination=child(ROOT,archivePath),bytes=Buffer.from('Engineering cross-drive transfer fixture. Not a ZIP or a produced design.');
try{
 fs.writeFileSync(temporary,bytes,{flag:'wx'});storeTrialArchive({root:ROOT,temporary,archivePath,expectedSha256:hash(bytes)});assert.equal(fs.existsSync(temporary),false);assert.deepEqual(fs.readFileSync(destination),bytes);
 const receipt={observedAt:new Date().toISOString(),result:'passed-engineering-only',temporaryDrive:path.parse(temporary).root,projectDrive:path.parse(destination).root,bytes:bytes.length,hashVerified:true,stagingRemovedAfterVerification:true,publicInventoryChanged:false,visualAdmission:false};
 const output=child(ROOT,'docs/evidence/redo-v2/static-pipeline/archive-transfer.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);if(fs.existsSync(destination))fs.unlinkSync(destination)}
