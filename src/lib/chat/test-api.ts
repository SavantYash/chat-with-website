/**
 * Standalone test script to verify Next.js POST /api/chat endpoint.
 * Assumes Next.js server is running locally on http://localhost:3000.
 * Run using: npx tsx src/lib/chat/test-api.ts
 */
async function testApi() {
  console.log("=========================================");
  console.log("🚀 Running Next.js /api/chat Endpoint Verification");
  console.log("=========================================");

  const payload1 = {
    message: "What is JavaScript?",
    topK: 2,
  };

  const payload2 = {
    message: "What are the primary colors?",
    topK: 2,
  };

  const payload3 = {
    // Missing required message parameter
    topK: 2,
  };

  try {
    // Test 1: Successful / grounded fallback question answering
    console.log("\n1️⃣  Testing query: \"What is JavaScript?\"...");
    const res1 = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload1),
    });
    console.log(`   Response Status: ${res1.status}`);
    const data1: any = await res1.json();
    console.log("   Response Body:", JSON.stringify(data1, null, 2));

    if (res1.status === 200 && data1.answer && Array.isArray(data1.sources)) {
      console.log("   ✅ PASS: Returns status 200 and correct JSON response shape.");
    } else {
      console.error("   ❌ FAIL: Response status or shape is incorrect.");
    }

    // Test 2: Grounded fallback when no context is found (e.g. out-of-scope query)
    console.log("\n2️⃣  Testing out-of-scope query: \"What are the primary colors?\"...");
    const res2 = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload2),
    });
    console.log(`   Response Status: ${res2.status}`);
    const data2: any = await res2.json();
    console.log("   Response Body:", JSON.stringify(data2, null, 2));

    if (res2.status === 200 && data2.answer.includes("I couldn't find that information in the indexed website.")) {
      console.log("   ✅ PASS: Returns grounded fallback response correctly.");
    } else {
      console.error("   ❌ FAIL: Did not return correct grounded fallback response.");
    }

    // Test 3: Invalid request payload (expecting 400 Bad Request)
    console.log("\n3️⃣  Testing invalid request (missing 'message')...");
    const res3 = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload3),
    });
    console.log(`   Response Status: ${res3.status}`);
    const data3: any = await res3.json();
    console.log("   Response Body:", JSON.stringify(data3, null, 2));

    if (res3.status === 400 && data3.error) {
      console.log("   ✅ PASS: Correctly returns HTTP 400 for validation failure.");
    } else {
      console.error("   ❌ FAIL: Did not return HTTP 400 for validation failure.");
    }

    console.log("\n=========================================");
    console.log("🎉 API Verification complete.");
    console.log("=========================================");

  } catch (error: any) {
    console.error("\n❌ API verification request failed. Make sure 'npm run dev' is running locally.");
    console.error(`   Error message: ${error.message}`);
    process.exit(1);
  }
}

testApi();
