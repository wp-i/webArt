import fs from'node:fs';import path from'node:path';import{verifyEvidence}from'../quality-gate.mjs';import{ProductionError}from'./api.mjs';
export function assertReferenceSelection(root,url,recheck){
 const host=value=>new URL(value).hostname.replace(/^www\./,''),index=JSON.parse(fs.readFileSync(path.join(root,'docs/production/reference-index.json'),'utf8')),known=index.references.find(r=>host(r.url)===host(url));
 if(known?.status!=='rejected')return {status:known?.status??'unreviewed',newAdmission:false};
 if(!recheck||typeof recheck.reason!=='string'||recheck.reason.length<50||!recheck.record||!Array.isArray(recheck.evidence)||!recheck.evidence.length)throw new ProductionError('rejected-reference','已拒绝域名须有具体新证据及绑定决策记录，不能重新浏览或进入生成：'+known.name);
 verifyEvidence(root,[recheck.record,...recheck.evidence]);return {status:'explicit-recheck-only',reason:recheck.reason,newAdmission:false};
}
