import { PromptBuilder } from "./prompt-builder";
import { DocumentChunk } from "../../types";

/**
 * Standalone test runner to verify PromptBuilder functionality.
 * Run using: npx tsx src/lib/chat/test-prompt.ts
 */
function runTest() {
  console.log("=========================================");
  console.log("🚀 Running PromptBuilder Unit Tests");
  console.log("=========================================");

  const builder = new PromptBuilder();

  // Create mock chunks
  const mockChunks: DocumentChunk[] = [
    {
      id: "mock-chunk-1",
      url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      title: "JavaScript - MDN Web Docs",
      content: "JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions. While it is most well-known as the scripting language for Web pages, many non-browser environments also use it.",
      chunkIndex: 0,
      totalChunks: 3,
      startOffset: 0,
      endOffset: 250
    },
    {
      id: "mock-chunk-2",
      url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions",
      title: "Functions - MDN Web Docs",
      content: "Functions are one of the fundamental building blocks in JavaScript. A function in JavaScript is similar to a procedure—a set of statements that performs a task or calculates a value.",
      chunkIndex: 0,
      totalChunks: 2,
      startOffset: 0,
      endOffset: 210
    }
  ];

  // Test case 1: Answerable query with context
  console.log("\n1️⃣  Test Case: Answerable query with context");
  const prompt1 = builder.buildPrompt("What is JavaScript?", mockChunks);
  console.log("Generated Prompt:");
  console.log("-----------------------------------------");
  console.log(prompt1);
  console.log("-----------------------------------------");

  // Verify prompt structure exists and is populated
  if (
    prompt1.includes("## System Instructions") &&
    prompt1.includes("========================\nCONTEXT") &&
    prompt1.includes("[Source 1]") &&
    prompt1.includes("[Source 2]") &&
    prompt1.includes("========================\nQUESTION") &&
    prompt1.includes("What is JavaScript?") &&
    prompt1.includes("========================\nANSWER")
  ) {
    console.log("✅ PASS: Correctly formatted prompt with system instructions, multiple sources, and dividers.");
  } else {
    throw new Error("FAIL: Prompt structure validation failed on Test Case 1.");
  }

  // Test case 2: Unanswerable query with context
  console.log("\n2️⃣  Test Case: Unanswerable query with context");
  const prompt2 = builder.buildPrompt("What are the primary colors?", mockChunks);
  console.log("Generated Prompt:");
  console.log("-----------------------------------------");
  console.log(prompt2);
  console.log("-----------------------------------------");

  if (prompt2.includes("What are the primary colors?")) {
    console.log("✅ PASS: Correctly formatted prompt with unanswerable question.");
  } else {
    throw new Error("FAIL: Prompt structure validation failed on Test Case 2.");
  }

  // Test case 3: Empty context
  console.log("\n3️⃣  Test Case: Empty context list");
  const prompt3 = builder.buildPrompt("Tell me about JavaScript.", []);
  console.log("Generated Prompt:");
  console.log("-----------------------------------------");
  console.log(prompt3);
  console.log("-----------------------------------------");

  const contextSection = prompt3.split("========================\nCONTEXT\n========================")[1]?.split("========================\nQUESTION")[0] || "";
  if (
    prompt3.includes("No relevant context was retrieved.") &&
    !contextSection.includes("[Source 1]")
  ) {
    console.log("✅ PASS: Correctly formatted prompt when context chunks are empty.");
  } else {
    throw new Error("FAIL: Prompt structure validation failed on Test Case 3 (Empty Context).");
  }

  console.log("\n=========================================");
  console.log("🎉 All PromptBuilder unit tests passed successfully!");
  console.log("=========================================");
}

runTest();
