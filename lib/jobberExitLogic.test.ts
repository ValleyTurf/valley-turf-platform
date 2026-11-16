import { describe, expect, it } from "vitest";
import { buildExitReport } from "./jobberExitLogic";

describe("jobberExitLogic", () => {
  // Each check is one test; expected values compare by content.
  function eq(got: unknown, want: unknown, name: string) {
    it(name, () => {
      expect(got).toEqual(want);
    });
  }

  const now=new Date("2026-11-16T12:00:00Z");
  const c=(id:string,src:string|null=null)=>({clientId:id,name:id,modeSource:src});
  const inv=(clientId:string,status:string,total:number,issueDate:string)=>({clientId,status,total,issueDate,invoiceNumber:"1"});
  let r=buildExitReport({jobberInvoicedCustomers:[],jobberInvoices:[],jobberPayments:[],nativeCardClientIds:new Set(),now});
  eq(r.readyToCancel,true,"empty ready");
  r=buildExitReport({jobberInvoicedCustomers:[c("a","auto_has_card"),c("b"),c("old")],
    jobberInvoices:[inv("a","SENT",100,"2026-11-01"),inv("b","PAID",50,"2026-10-20"),inv("old","PAID",50,"2025-01-01")],
    jobberPayments:[{amount:50,paymentDate:"2026-11-10"},{amount:9,paymentDate:"2026-08-01"}],nativeCardClientIds:new Set(),now});
  eq(r.stillOnJobber.map(x=>x.clientId),["a","b"],"who");
  eq(r.stillOnJobber[0].needsCardMoved,true,"card moved");
  eq(r.openInvoiceCount,1,"open");
  eq(r.openInvoiceTotal,100,"open total");
  eq(r.jobberPaymentsRecent,{count:1,total:50},"payments");
  eq(r.readyToCancel,false,"not ready");
  eq(r.blockers.length,3,"blockers");
  r=buildExitReport({jobberInvoicedCustomers:[c("a","auto_has_card")],jobberInvoices:[inv("a","paid",100,"2026-11-01")],jobberPayments:[],nativeCardClientIds:new Set(["a"]),now});
  eq(r.stillOnJobber[0].needsCardMoved,false,"has native card");
  // an old open invoice still counts
  r=buildExitReport({jobberInvoicedCustomers:[c("z")],jobberInvoices:[inv("z","OVERDUE",70,"2025-03-01")],jobberPayments:[],nativeCardClientIds:new Set(),now});
  eq(r.stillOnJobber.length,1,"old open counts");
});
