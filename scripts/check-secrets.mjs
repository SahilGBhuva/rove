import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const result=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'});
if(result.status!==0)throw new Error('Unable to list tracked files');
const files=result.stdout.split('\0').filter(Boolean);
const configured=[process.env.SF_511_API_KEY,process.env.AC_TRANSIT_API_TOKEN,process.env.AC_TRANSIT_STATIC_TOKEN].filter(Boolean);
const patterns=[
  /(?:api_key|token)=[A-Za-z0-9_-]{20,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
];
const findings=[];
for(const file of files){
  if(file==='.env.example')continue;
  const stat=fs.statSync(file);if(!stat.isFile()||stat.size>25_000_000)continue;
  const content=fs.readFileSync(file,'utf8');
  if(patterns.some(pattern=>pattern.test(content))||configured.some(secret=>secret&&content.includes(secret)))findings.push(file);
}
if(findings.length){console.error(`Potential secret material in tracked files: ${findings.join(', ')}`);process.exit(1)}
console.log(`Secret check passed across ${files.length} tracked files.`);
