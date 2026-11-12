import fs from 'node:fs';
import {ROOT,child} from './collection.mjs';
import {readReviewRequest,submitSessionReview,cancelSessionReview} from './production/session-review.mjs';
const [action,file,resultFile]=process.argv.slice(2);
try{
  if(action==='inspect'){
    const {request,requestSha256}=readReviewRequest(ROOT,file);
    console.log(JSON.stringify({...request,requestSha256},null,2));
  }else if(action==='submit'){
    console.log(JSON.stringify(submitSessionReview({root:ROOT,requestFile:file,result:JSON.parse(fs.readFileSync(child(ROOT,resultFile),'utf8'))}),null,2));
  }else if(action==='cancel'){console.log(JSON.stringify(cancelSessionReview({root:ROOT,requestFile:file,reason:resultFile}),null,2))}
  else throw Error('Usage: node scripts/review-session.mjs inspect <request.json> | submit <request.json> <reviewed-result.json> | cancel <request.json> <reason>');
}catch(e){console.error(e.message);process.exitCode=1}
