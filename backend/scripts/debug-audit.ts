import { auditHash } from '../src/audit';
import { createDatabase } from '../src/db';
async function main(){
 const db=createDatabase();
 const result=await db.query(`SELECT id, seq::text, timestamp, actor_id AS "actorId", action, entity_type AS "entityType", entity_id AS "entityId", previous_value AS "previousValue", updated_value AS "updatedValue", reason, request_id AS "requestId", prev_hash AS "prevHash", integrity_hash AS "integrityHash" FROM audit_events ORDER BY audit_events.seq ASC`);
 let previous:string|null=null;
 for(const row of result.rows){
  const expected=auditHash({prevHash:previous,timestamp:new Date(row.timestamp).toISOString(),actorId:row.actorId,action:row.action,entityType:row.entityType,entityId:row.entityId,previousValue:row.previousValue,updatedValue:row.updatedValue,reason:row.reason,requestId:row.requestId});
  if(row.prevHash!==previous||row.integrityHash!==expected){
   console.log('BROKEN', {id:row.id,seq:row.seq,action:row.action,entity:row.entityType,prevStored:row.prevHash,prevExpected:previous,hashStored:row.integrityHash,hashExpected:expected});
   const before=result.rows[result.rows.indexOf(row)-1]; console.log('BEFORE',{id:before?.id,seq:before?.seq,hash:before?.integrityHash,time:before?.timestamp});
   console.log('ROW TIMESTAMP',row.timestamp,new Date(row.timestamp).toISOString());
   console.log('prevVal',JSON.stringify(row.previousValue),'updVal',JSON.stringify(row.updatedValue),'reason',row.reason,'req',row.requestId);
   break;
  }
  previous=row.integrityHash;
 }
 await db.close();
}
main();
