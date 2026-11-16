import { describe, expect, it } from "vitest";
import {
  buildCategoryTotals,
  buildMonthlyPnl,
  buildPaymentMethodTotals,
  readmeText,
} from "./taxPackageLogic";

describe("taxPackageLogic", () => {
  // Each check is one test; expected values compare by content.
  function eq(got: unknown, want: unknown, name: string) {
    it(name, () => {
      expect(got).toEqual(want);
    });
  }

  const groupOf=(c:string)=>c==="cost_of_service"?"cogs":c==="payroll"?"payroll":"opex";
  const rows=buildMonthlyPnl({year:2026,invoices:[{issueDate:"2026-01-05",total:1000},{issueDate:"2026-01-20",total:500.255},{issueDate:"2026-02-01",total:200},{issueDate:"2025-12-31",total:999}],
   expenses:[{date:"2026-01-10",amount:100,category:"cost_of_service"},{date:"2026-01-11",amount:50,category:"payroll"},{date:"2026-01-12",amount:25.5,category:"software"}],
   groupOf,overheadForMonth:(m)=>m==="2026-01"?100:0});
  eq(rows.length,12,"12 months");
  eq(rows[0],{month:"2026-01",revenue:1500.26,cost_of_service:100,payroll:50,operating_expenses:25.5,fixed_overhead_estimate:100,net_profit:1224.76},"jan");
  eq(rows[1].revenue,200,"feb");
  eq(rows[11].net_profit,0,"empty month");
  const cats=buildCategoryTotals({expenses:[{date:"d",amount:10,category:"fuel"},{date:"d",amount:5,category:"fuel"},{date:"d",amount:30,category:"software"}],labelOf:c=>c.toUpperCase(),groupLabelOf:()=>"g"});
  eq(cats.map(c=>[c.category,c.total,c.entries]),[["SOFTWARE",30,1],["FUEL",15,2]],"cats");
  const pm=buildPaymentMethodTotals([{method:"Stripe",amount:100,tip:5,fee:3},{method:"Stripe",amount:50,tip:0,fee:1.5},{method:"Zelle",amount:200,tip:0,fee:0},{method:"",amount:1,tip:0,fee:0}]);
  eq(pm.map(r=>[r.paid_with,r.collected,r.payments]),[["Zelle",200,1],["Stripe",150,2],["Unknown",1,1]],"methods");
  eq(readmeText({year:2026,generatedOn:"2026-11-16",unreviewedBankRows:3}).includes("3 bank feed transactions"),true,"readme warns");
  eq(readmeText({year:2026,generatedOn:"2026-11-16",unreviewedBankRows:0}).includes("Heads up"),false,"readme quiet");
});
