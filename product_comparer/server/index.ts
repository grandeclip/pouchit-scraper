import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3200;

// CORS 설정
app.use(cors());
app.use(express.json());

// 파일 업로드 설정
const upload = multer({ storage: multer.memoryStorage() });

// results 디렉토리 경로
const RESULTS_DIR = path.join(__dirname, "../../product_scanner/results");

// 날짜 목록 조회
app.get("/api/dates", (req, res) => {
  try {
    if (!fs.existsSync(RESULTS_DIR)) {
      return res.json([]);
    }

    const dates = fs
      .readdirSync(RESULTS_DIR)
      .filter((name) => {
        const fullPath = path.join(RESULTS_DIR, name);
        return (
          fs.statSync(fullPath).isDirectory() &&
          /^\d{4}-\d{2}-\d{2}$/.test(name)
        );
      })
      .sort()
      .reverse();

    res.json(dates);
  } catch (error) {
    console.error("Error reading dates:", error);
    res.status(500).json({ error: "Failed to read dates" });
  }
});

// 특정 날짜의 파일 목록 조회
app.get("/api/files/:date", (req, res) => {
  try {
    const { date } = req.params;
    const dateDir = path.join(RESULTS_DIR, date);

    if (!fs.existsSync(dateDir)) {
      return res.json([]);
    }

    const files = fs
      .readdirSync(dateDir)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => {
        const fullPath = path.join(dateDir, name);
        const stats = fs.statSync(fullPath);

        // 파일명에서 플랫폼 추출 (job_platform_uuid.jsonl)
        const match = name.match(/^job_([^_]+)_/);
        const platform = match ? match[1] : "unknown";

        // UUID7에서 타임스탬프 추출 (첫 12자리)
        const uuidMatch = name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4})/);
        let timestamp = null;
        if (uuidMatch) {
          // UUID7의 타임스탬프는 처음 48비트 (12자리 hex)
          const hex = uuidMatch[1].replace(/-/g, "").substring(0, 12);
          timestamp = parseInt(hex, 16);
        }

        return {
          name,
          platform,
          size: stats.size,
          timestamp,
          mtime: stats.mtime,
        };
      })
      .sort((a, b) => {
        // 플랫폼 순 → 타임스탬프 순
        if (a.platform !== b.platform) {
          return a.platform.localeCompare(b.platform);
        }
        return (b.timestamp || 0) - (a.timestamp || 0);
      });

    res.json(files);
  } catch (error) {
    console.error("Error reading files:", error);
    res.status(500).json({ error: "Failed to read files" });
  }
});

// JSONL 파일 내용 조회
app.get("/api/content/:date/:filename", (req, res) => {
  try {
    const { date, filename } = req.params;
    const filePath = path.join(RESULTS_DIR, date, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");

    // 첫 줄과 마지막 줄에서 meta 추출
    const firstLine = JSON.parse(lines[0]);
    const lastLine = JSON.parse(lines[lines.length - 1]);

    const hasMeta = firstLine._meta === true;
    const hasFooter = lastLine._meta === true && lastLine.type === "footer";

    const meta = {
      header: hasMeta ? firstLine : null,
      footer: hasFooter ? lastLine : null,
      duration: null as number | null,
      incomplete: !hasFooter,
    };

    // 소요 시간 계산
    if (meta.header?.started_at && meta.footer?.completed_at) {
      const start = new Date(meta.header.started_at).getTime();
      const end = new Date(meta.footer.completed_at).getTime();
      meta.duration = end - start;
    }

    // 상품 데이터 파싱 (meta 제외)
    const products = lines
      .slice(hasMeta ? 1 : 0, hasFooter ? -1 : undefined)
      .map((line) => JSON.parse(line));

    res.json({ meta, products });
  } catch (error) {
    console.error("Error reading file content:", error);
    res.status(500).json({ error: "Failed to read file content" });
  }
});

// 업로드된 JSONL 파일 처리
app.post("/api/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const content = req.file.buffer.toString("utf-8");
    const lines = content.trim().split("\n");

    const firstLine = JSON.parse(lines[0]);
    const lastLine = JSON.parse(lines[lines.length - 1]);

    const hasMeta = firstLine._meta === true;
    const hasFooter = lastLine._meta === true && lastLine.type === "footer";

    const meta = {
      header: hasMeta ? firstLine : null,
      footer: hasFooter ? lastLine : null,
      duration: null as number | null,
      incomplete: !hasFooter,
    };

    if (meta.header?.started_at && meta.footer?.completed_at) {
      const start = new Date(meta.header.started_at).getTime();
      const end = new Date(meta.footer.completed_at).getTime();
      meta.duration = end - start;
    }

    const products = lines
      .slice(hasMeta ? 1 : 0, hasFooter ? -1 : undefined)
      .map((line) => JSON.parse(line));

    res.json({ meta, products });
  } catch (error) {
    console.error("Error processing uploaded file:", error);
    res.status(500).json({ error: "Failed to process uploaded file" });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
