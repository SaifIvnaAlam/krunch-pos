-- Replace all branch employee rosters with the 10-person demo seed roster.
UPDATE "BranchEmployeeDirectory"
SET
  "employees" = $json$[
  {"id":"emp-demo-0001","name":"Jihad","role":"Front Manager","phone":"+880 1770-401212","email":"jihad@krunch.test","defaultBasicSalary":30000,"serviceChargePct":10,"active":true,"notes":""},
  {"id":"emp-demo-0002","name":"Fatima Rahman","role":"Head Chef","phone":"+880 1711-223344","email":"fatima@krunch.test","defaultBasicSalary":28000,"serviceChargePct":null,"active":true,"notes":""},
  {"id":"emp-demo-0003","name":"Karim Hassan","role":"Waiter","phone":"+880 1812-556677","email":"karim@krunch.test","defaultBasicSalary":12000,"serviceChargePct":9,"active":true,"notes":""},
  {"id":"emp-demo-0004","name":"Nadia Islam","role":"Host","phone":"+880 1913-889900","email":"nadia@krunch.test","defaultBasicSalary":14000,"serviceChargePct":8,"active":true,"notes":""},
  {"id":"emp-demo-0005","name":"Salim Ahmed","role":"Waiter","phone":"+880 1614-112233","email":"salim@krunch.test","defaultBasicSalary":12000,"serviceChargePct":9,"active":true,"notes":""},
  {"id":"emp-demo-0006","name":"Abdullah Khan","role":"Bartender","phone":"+880 1515-445566","email":"abdullah@krunch.test","defaultBasicSalary":15000,"serviceChargePct":7,"active":true,"notes":""},
  {"id":"emp-demo-0007","name":"Priya Das","role":"Cashier","phone":"+880 1316-778899","email":"priya@krunch.test","defaultBasicSalary":16000,"serviceChargePct":null,"active":true,"notes":""},
  {"id":"emp-demo-0008","name":"Mojeeb Ali","role":"Kitchen Helper","phone":"+880 1417-001122","email":"mojeeb@krunch.test","defaultBasicSalary":10000,"serviceChargePct":null,"active":true,"notes":""},
  {"id":"emp-demo-0009","name":"Atick Hossain","role":"Runner","phone":"+880 1718-334455","email":"atick@krunch.test","defaultBasicSalary":9000,"serviceChargePct":5,"active":true,"notes":""},
  {"id":"emp-demo-0010","name":"Rina Akter","role":"Shift Supervisor","phone":"+880 1819-667788","email":"rina@krunch.test","defaultBasicSalary":22000,"serviceChargePct":10,"active":false,"notes":"On leave — inactive for payroll"}
]$json$::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP;
