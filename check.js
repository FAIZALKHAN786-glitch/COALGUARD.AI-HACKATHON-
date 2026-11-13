const {Pool}=require('pg');
const p=new Pool({connectionString:'postgres://user:pass@127.0.0.1:5432/db'});
p.query('SELECT 1',[]).catch(e=>{console.log(e.message);process.exit(0);});
setTimeout(()=>process.exit(0),1000);
