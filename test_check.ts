import { validateUrlAgainstSSRF } from "./src/routes/fetch";
import { isAllowedByRobotsTxt } from "./src/middleware/robots";

async function main() {
  const ssrf = await validateUrlAgainstSSRF("https://changelog.com/weekly/feed");
  console.log("SSRF for changelog:", ssrf);
  const robots = await isAllowedByRobotsTxt("https://changelog.com/weekly/feed");
  console.log("Robots for changelog:", robots);

  const ssrfPg = await validateUrlAgainstSSRF("http://www.paulgraham.com/superlinear.html");
  console.log("SSRF for PG:", ssrfPg);
  const robotsPg = await isAllowedByRobotsTxt("http://www.paulgraham.com/superlinear.html");
  console.log("Robots for PG:", robotsPg);
}
main();
