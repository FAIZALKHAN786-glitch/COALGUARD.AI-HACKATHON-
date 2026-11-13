const {Pool}=require('pg');
const p=new Pool({connectionString:'postgres://x'});
p.query('SELECT 1',[]).catch(e=>{console.log(e.message);});
p.end();
