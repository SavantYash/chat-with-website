import { UrlNormalizer } from "./normalizer";

function runTests() {
  const normalizer = new UrlNormalizer();
  let failures = 0;

  function assert(base: string, link: string, expected: string | null, description: string) {
    const result = normalizer.resolveAndNormalize(link, base);
    if (result === expected) {
      console.log(`✅ PASS: ${description}`);
    } else {
      console.error(`❌ FAIL: ${description}`);
      console.error(`   Base:     ${base}`);
      console.error(`   Link:     ${link}`);
      console.error(`   Expected: ${expected}`);
      console.error(`   Got:      ${result}`);
      failures++;
    }
  }

  console.log("=========================================");
  console.log("🚀 Running UrlNormalizer Unit Tests");
  console.log("=========================================");

  // 1. Directory Seed URLs (without trailing slash)
  assert(
    "https://web-bunny.com/Dhyat_html",
    "about.html",
    "https://web-bunny.com/Dhyat_html/about.html",
    "Base directory without trailing slash resolves relative links correctly"
  );

  // 2. Directory Seed URLs (with trailing slash)
  assert(
    "https://web-bunny.com/Dhyat_html/",
    "about.html",
    "https://web-bunny.com/Dhyat_html/about.html",
    "Base directory with trailing slash resolves relative links correctly"
  );

  // 3. File URLs
  assert(
    "https://web-bunny.com/Dhyat_html/page.html",
    "about.html",
    "https://web-bunny.com/Dhyat_html/about.html",
    "Base file URL resolves relative link against parent directory"
  );

  // 4. Root-relative paths
  assert(
    "https://web-bunny.com/Dhyat_html/",
    "/about.html",
    "https://web-bunny.com/about.html",
    "Base resolves root-relative links to host root"
  );

  // 5. Regression check: Root base URL
  assert(
    "https://web-bunny.com/",
    "about.html",
    "https://web-bunny.com/about.html",
    "Root base resolves relative link correctly"
  );

  // 6. Regression check: Relative parent segment ../
  assert(
    "https://web-bunny.com/about.html",
    "../contact.html",
    "https://web-bunny.com/contact.html",
    "Base file resolves parent relative link '../' correctly"
  );

  // 7. Relative dot segments ./
  assert(
    "https://web-bunny.com/Dhyat_html",
    "./about.html",
    "https://web-bunny.com/Dhyat_html/about.html",
    "Base directory resolves './' link correctly"
  );

  // 8. Query parameters & Fragments
  assert(
    "https://web-bunny.com/Dhyat_html",
    "about.html?q=1#section",
    "https://web-bunny.com/Dhyat_html/about.html?q=1",
    "Base resolves link with query parameters and strips hash fragments"
  );

  // 9. Malformed or placeholder template link filtering
  assert(
    "https://web-bunny.com/Dhyat_html",
    ".html",
    null,
    "Malformed link '.html' is filtered out"
  );

  assert(
    "https://web-bunny.com/Dhyat_html",
    "#",
    null,
    "Fragment-only link '#' is filtered out"
  );

  assert(
    "https://web-bunny.com/Dhyat_html",
    "javascript:void(0)",
    null,
    "Javascript-only link is filtered out"
  );

  console.log("=========================================");
  if (failures === 0) {
    console.log("🎉 All UrlNormalizer tests passed!");
    process.exit(0);
  } else {
    console.error(`❌ ${failures} tests failed!`);
    process.exit(1);
  }
}

runTests();
