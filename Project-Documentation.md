# Project Documentation: RAG Website Assistant

## 1. Project Name
RAG Website Assistant (Repository: `chat-with-website`)

## 2. What is this project about?
This project is a production-grade, highly modular Retrieval-Augmented Generation (RAG) system. It is designed to recursively crawl target websites, extract clean readable text, segment the content into semantic chunks, and store their vector embeddings locally. This enables a grounded chat interface where users can ask questions and receive natural language answers backed by citations from the crawled website.

## 3. How a normal user can use it
A normal user can use this system through its web interface in two simple steps:
1. **Indexing**: Enter a target website URL into the system. The assistant will crawl the website, read its content, and index it into its local knowledge base. The user can monitor the progress through a live terminal-like interface.
2. **Chatting**: Once the website is indexed, the user can use the chat interface to ask any questions related to the indexed website. The assistant will provide accurate answers grounded in the website's content, complete with source citations so the user can verify the information.

## 4. Technologies Used
- **Frontend**: React 19, TailwindCSS
- **Backend**: Next.js 16 (App Router), Node.js, TypeScript
- **AI / LLM**: Google Gemini 3.1 Flash Lite (for chat generation), Gemini Embedding 2 (768 Dimensions)
- **Database**: LanceDB (embedded local vector database) / Apache Arrow
- **Key Libraries**: Cheerio, jsdom, robots-parser, @google/genai SDK

## 5. How to set up this project
To set up this project locally, follow these steps:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/rag-website-assistant.git
   cd chat-with-website
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment Variables**:
   Create a `.env.local` file in the root directory and add your Google Gemini API key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   # Optional: GEMINI_CHAT_MODEL=gemini-3.1-flash-lite
   ```
4. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:3000`.

## 6. How it works
The architecture is divided into two main pipelines:

### Ingest & Indexing Pipeline:
- **Crawler**: Scrapes the target website using Breadth-First Search while respecting `robots.txt` and rate limits.
- **Extractor**: Cleans the raw HTML, stripping out scripts and styles to extract semantic text (Markdown format).
- **Chunker**: Breaks the extracted text into overlapping segments to preserve context.
- **Embedder**: Converts these text segments into vector representations using the Gemini Embedding API.
- **Vector Store**: Saves these vectors in a local LanceDB database.

### Retrieval & Chat Query Flow:
- **Retriever**: When a user asks a question, the system converts the query into a vector and searches LanceDB for the most relevant stored chunks.
- **Prompt Builder**: Assembles a system prompt that includes the retrieved context.
- **Chat Provider**: Sends the grounded prompt to the Gemini LLM to generate an answer.
- **Response**: The user receives the generated answer along with specific citations indicating which parts of the website the information was drawn from.
