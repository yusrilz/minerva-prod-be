import { $ } from "bun";

async function runAudit() {
  // this part is modified to ensure [supply chain dependency scanning automation for high/critical vulnerabilities]
  console.log("Running npm audit --json...");
  
  const proc = Bun.spawn(["npm", "audit", "--json"], {
    stdout: "pipe",
    stderr: "pipe"
  });
  
  const text = await new Response(proc.stdout).text();
  await proc.exited;

  try {
    const result = JSON.parse(text);
    const vulns = result.metadata?.vulnerabilities;
    
    if (vulns && (vulns.high > 0 || vulns.critical > 0)) {
      console.error("❌ High or Critical vulnerabilities found in dependencies!");
      console.error(JSON.stringify(vulns, null, 2));
      process.exit(1);
    } else {
      console.log("✅ No High or Critical vulnerabilities found.");
      process.exit(0);
    }
  } catch (err) {
    console.error("Failed to parse npm audit output", err);
    console.error("Raw output:", text);
    process.exit(1);
  }
}

runAudit();
