/**
 * Standalone test script to verify Next.js POST /api/chat endpoint.
 * Assumes Next.js server is running locally on http://localhost:3000.
 * Run using: npx tsx src/lib/chat/test-api.ts
 */
async function testApi() {
  console.log("=========================================");
  console.log("🚀 Running Next.js API Endpoints Verification");
  console.log("=========================================");

  try {
    // 1. Trigger crawler and indexing via POST /api/index
    console.log("\n1️⃣  Testing POST /api/index: Indexing https://example.com...");
    const resIndex = await fetch("http://localhost:3000/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        maxPages: 1,
      }),
    });
    console.log(`   Response Status: ${resIndex.status}`);
    const dataIndex: any = await resIndex.json();
    console.log("   Response Body:", JSON.stringify(dataIndex, null, 2));

    if (resIndex.status === 200 && dataIndex.success && dataIndex.meta.totalChunks > 0) {
      console.log("   ✅ PASS: Website indexed successfully via API.");
    } else {
      throw new Error(`Crawl indexing failed. Response status: ${resIndex.status}`);
    }

    // 2. Query grounded answer via POST /api/chat
    console.log("\n2️⃣  Testing POST /api/chat: Answerable query...");
    const resChat1 = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What is domain is this page used for?",
        topK: 2,
      }),
    });
    console.log(`   Response Status: ${resChat1.status}`);
    const dataChat1: any = await resChat1.json();
    console.log("   Response Body:", JSON.stringify(dataChat1, null, 2));

    const fallbackText = "I couldn't find that information in the indexed website.";
    if (
      resChat1.status === 200 &&
      dataChat1.answer &&
      !dataChat1.answer.includes(fallbackText) &&
      dataChat1.sources.length > 0
    ) {
      console.log("   ✅ PASS: Returns status 200 and grounded answer with citations.");
    } else {
      throw new Error("Grounded chat query failed or returned fallback message.");
    }

    // 3. Query out-of-scope question via POST /api/chat (expect fallback)
    console.log("\n3️⃣  Testing POST /api/chat: Out-of-scope query...");
    const resChat2 = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What are the primary colors?",
        topK: 2,
      }),
    });
    console.log(`   Response Status: ${resChat2.status}`);
    const dataChat2: any = await resChat2.json();
    console.log("   Response Body:", JSON.stringify(dataChat2, null, 2));

    if (resChat2.status === 200 && dataChat2.answer.includes(fallbackText)) {
      console.log("   ✅ PASS: Correctly triggers grounded fallback response.");
    } else {
      throw new Error("Out-of-scope query failed to trigger the fallback response.");
    }

    // 4. Test validation failure (missing message)
    console.log("\n4️⃣  Testing POST /api/chat: Invalid request (missing 'message')...");
    const resChat3 = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topK: 2,
      }),
    });
    console.log(`   Response Status: ${resChat3.status}`);
    const dataChat3: any = await resChat3.json();
    console.log("   Response Body:", JSON.stringify(dataChat3, null, 2));

    if (resChat3.status === 400 && dataChat3.error) {
      console.log("   ✅ PASS: Correctly returns HTTP 400 for validation failure.");
    } else {
      throw new Error("Validation failure test failed.");
    }

    // 5. Test validation failure for index (missing URL)
    console.log("\n5️⃣  Testing POST /api/index: Invalid request (missing 'url')...");
    const resIndex2 = await fetch("http://localhost:3000/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxPages: 5,
      }),
    });
    console.log(`   Response Status: ${resIndex2.status}`);
    const dataIndex2: any = await resIndex2.json();
    console.log("   Response Body:", JSON.stringify(dataIndex2, null, 2));

    if (resIndex2.status === 400 && dataIndex2.error) {
      console.log("   ✅ PASS: Correctly returns HTTP 400 for indexing validation failure.");
    } else {
      throw new Error("Indexing validation failure test failed.");
    }

    console.log("\n=========================================");
    console.log("🎉 All Next.js API endpoint verifications passed!");
    console.log("=========================================");

  } catch (error: any) {
    console.error("\n❌ API verification request failed. Make sure 'npm run dev' is running locally.");
    console.error(`   Error message: ${error.message}`);
    process.exit(1);
  }
}

testApi();
