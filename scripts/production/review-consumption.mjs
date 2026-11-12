import fs from 'node:fs';
import path from 'node:path';
import {safeFile, verifyEvidence} from '../quality-gate.mjs';
import {hash, ProductionError} from './api.mjs';
import {validateCliReviewTransport, projectCliReviewReport, createCliReviewConsumptionReceipt, validateCliReviewConsumptionReceipt} from './cli-review-receipt.mjs';

const need=(ok,message)=>{if(!ok)throw new ProductionError('cli-review-consumption-invalid',message)};
const evidence=(root,file)=>({path:file,sha256:hash(fs.readFileSync(safeFile(root,file)))});

// Project decisions from the actual immutable response. No caller-authored
// verdict or inherited calibration model identity can replace that response.
export function consumeCliReview({root,client,role,context,report}){
 if(client.reviewerMetadata?.mode!=='evidence-only-fresh-codex-cli')return report;
 const actual=client.lastReviewReceipt;
 verifyEvidence(root,[actual]);
 const raw=JSON.parse(fs.readFileSync(safeFile(root,actual.path),'utf8'));
 need(raw.role===role,'Receipt belongs to another review role');
 let request;
 if(raw.kind==='portable-cli-review-consumption')request=raw.request;
 else{
  need(raw.execution==='fresh-codex-cli-evidence-review'&&raw.isolationEvidence?.toolsObserved===0,'Missing actual evidence-only CLI execution');
  const requestPath=path.relative(path.resolve(root),raw.requestFile).replaceAll('\\','/');
  request={path:requestPath,sha256:raw.requestSha256};
 }
 const transport=validateCliReviewTransport({root,request,role});
 const canonical=projectCliReviewReport({root,transport,context});
 const attempt=path.posix.dirname(request.path),contextFile=attempt+'/consumption-context.json';
 const bytes=JSON.stringify(context,null,2)+'\n';
 if(fs.existsSync(path.join(root,...contextFile.split('/'))))need(fs.readFileSync(safeFile(root,contextFile),'utf8')===bytes,'Consumed review context changed; start a new review');
 else fs.writeFileSync(path.join(root,...contextFile.split('/')),bytes,{flag:'wx'});
 const contextRef=evidence(root,contextFile),directory=attempt+'/consumed',receiptFile=directory+'/receipt.json';
 let receipt;
 if(fs.existsSync(path.join(root,...receiptFile.split('/')))){
  receipt=evidence(root,receiptFile);
  validateCliReviewConsumptionReceipt({root,receipt,role,report:canonical});
 }else receipt=createCliReviewConsumptionReceipt({root,request,role,context:contextRef,report:canonical,directory});
 client.lastReviewReceipt=receipt;
 return {...canonical,reviewReceipt:receipt};
}
