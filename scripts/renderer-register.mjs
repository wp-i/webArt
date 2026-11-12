import {registerRenderer} from './production/renderers.mjs';
const [id,candidatePath,planPath,rulesPath,archiveReceiptPath,...extra]=process.argv.slice(2);
if(!id||!candidatePath||!planPath||!rulesPath||!archiveReceiptPath||extra.length){console.error('Usage: node scripts/renderer-register.mjs <name-v1> <private-candidate/delivery.json> <locked-plan.json> <content-rules.json> <verified-archive-receipt.json>');process.exitCode=1}
else try{console.log(JSON.stringify(await registerRenderer({id,candidatePath,planPath,rulesPath,archiveReceiptPath}),null,2))}catch(error){console.error(error.message);process.exitCode=1}
