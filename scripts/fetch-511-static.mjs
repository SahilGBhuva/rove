import fs from 'node:fs';
import path from 'node:path';

const [operator, outputArg] = process.argv.slice(2);
const key = process.env.SF_511_API_KEY?.trim();
if(!operator||!outputArg)throw new Error('Usage: fetch-511-static.mjs <operator> <output.zip>');
if(!key)throw new Error('SF_511_API_KEY is not configured');
const output=path.resolve(outputArg),temp=`${output}.download`;
const url=new URL('https://api.511.org/transit/datafeeds');
url.searchParams.set('operator_id',operator);
url.searchParams.set('api_key',key);
const response=await fetch(url,{headers:{Accept:'application/zip','User-Agent':'Rove-static-refresh/0.3'},signal:AbortSignal.timeout(60_000)});
if(!response.ok)throw new Error(`511 static feed ${operator} returned ${response.status}`);
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(temp,Buffer.from(await response.arrayBuffer()),{mode:0o600});
fs.renameSync(temp,output);
console.log(`Downloaded 511 static feed for ${operator}.`);
