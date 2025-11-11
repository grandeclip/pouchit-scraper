import { useState, useEffect } from "react";
import "./App.css";

interface FileInfo {
  name: string;
  platform: string;
  size: number;
  timestamp: number | null;
  mtime: string;
}

interface ProductData {
  product_set_id: string;
  product_id: string;
  url: string;
  db: {
    product_name: string;
    thumbnail: string;
    original_price: number;
    discounted_price: number;
    sale_status: string;
  };
  fetch: {
    product_name: string;
    thumbnail: string;
    original_price: number;
    discounted_price: number;
    sale_status: string;
  };
  comparison: {
    product_name: boolean;
    thumbnail: boolean;
    original_price: boolean;
    discounted_price: boolean;
    sale_status: boolean;
  };
  match: boolean;
  status: string;
}

interface MetaInfo {
  header: {
    job_id: string;
    platform: string;
    workflow_id: string;
    started_at: string;
  } | null;
  footer: {
    completed_at: string;
    summary: {
      total: number;
      success: number;
      failed: number;
      not_found: number;
      match_rate: number;
    };
  } | null;
  duration: number | null;
  incomplete: boolean;
}

interface FileData {
  meta: MetaInfo;
  products: ProductData[];
}

const API_BASE = "";

function App() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [uploadedData, setUploadedData] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // 필터 및 페이지네이션 상태
  const [filterMismatchOnly, setFilterMismatchOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // 날짜 목록 로드
  useEffect(() => {
    fetch(`${API_BASE}/api/dates`)
      .then((res) => res.json())
      .then(setDates)
      .catch((err) => setError(err.message));
  }, []);

  // 선택된 날짜의 파일 목록 로드
  useEffect(() => {
    if (!selectedDate) return;

    setLoading(true);
    fetch(`${API_BASE}/api/files/${selectedDate}`)
      .then((res) => res.json())
      .then((files) => {
        setFiles(files);
        setSelectedFile("");
        setFileData(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  // 선택된 파일 내용 로드
  useEffect(() => {
    if (!selectedDate || !selectedFile) return;

    setLoading(true);
    fetch(`${API_BASE}/api/content/${selectedDate}/${selectedFile}`)
      .then((res) => res.json())
      .then(setFileData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedDate, selectedFile]);

  // 파일 업로드 핸들러
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        setUploadedData(data);
        setSelectedDate("");
        setSelectedFile("");
        setFileData(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  // 표시할 데이터 선택
  const displayData = uploadedData || fileData;

  // 필터링된 상품 목록
  const filteredProducts =
    displayData?.products.filter(
      (product) => !filterMismatchOnly || !product.match,
    ) || [];

  // 페이지네이션 계산
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = filteredProducts.slice(startIndex, endIndex);

  // 불일치 항목 수
  const mismatchCount =
    displayData?.products.filter((p) => !p.match).length || 0;

  // 데이터 변경 시 페이지 초기화
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFile, uploadedData, filterMismatchOnly]);

  // 시간 포맷팅
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0
      ? `${minutes}분 ${remainingSeconds}초`
      : `${remainingSeconds}초`;
  };

  // product_set_id 복사
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert(`복사됨: ${text}`);
    });
  };

  // 썸네일 차이 표시
  const showThumbnailDiff = (dbUrl: string, fetchUrl: string) => {
    alert(`DB: ${dbUrl}\n\nFetch: ${fetchUrl}`);
  };

  return (
    <div className="app">
      <header>
        <h1>🔍 Product Validation Comparer</h1>
      </header>

      <main>
        {/* 날짜 선택 섹션 */}
        <section className="selector-section">
          <div className="selector-group">
            <label>📅 날짜 선택:</label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={loading}
            >
              <option value="">-- 날짜 선택 --</option>
              {dates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </div>

          {/* 파일 선택 */}
          {selectedDate && files.length > 0 && (
            <div className="selector-group">
              <label>📄 파일 선택:</label>
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                disabled={loading}
              >
                <option value="">-- 파일 선택 --</option>
                {files.map((file) => (
                  <option key={file.name} value={file.name}>
                    [{file.platform}] {file.name} (
                    {(file.size / 1024).toFixed(1)}KB)
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* 파일 업로드 섹션 */}
        <section className="upload-section">
          <label className="upload-label">
            📤 또는 JSONL 파일 업로드:
            <input
              type="file"
              accept=".jsonl"
              onChange={handleFileUpload}
              disabled={loading}
            />
          </label>
        </section>

        {/* 에러 표시 */}
        {error && <div className="error">❌ {error}</div>}

        {/* 로딩 */}
        {loading && <div className="loading">⏳ 로딩 중...</div>}

        {/* 메타 정보 */}
        {displayData?.meta && (
          <section className="meta-section">
            <h2>📊 작업 정보</h2>

            {displayData.meta.header && (
              <div className="meta-info">
                <div>
                  <strong>Job ID:</strong> {displayData.meta.header.job_id}
                </div>
                <div>
                  <strong>Platform:</strong> {displayData.meta.header.platform}
                </div>
                <div>
                  <strong>Workflow:</strong>{" "}
                  {displayData.meta.header.workflow_id}
                </div>
                <div>
                  <strong>시작 시간:</strong>{" "}
                  {new Date(displayData.meta.header.started_at).toLocaleString(
                    "ko-KR",
                  )}
                </div>
              </div>
            )}

            {displayData.meta.footer && (
              <div className="meta-info">
                <div>
                  <strong>완료 시간:</strong>{" "}
                  {new Date(
                    displayData.meta.footer.completed_at,
                  ).toLocaleString("ko-KR")}
                </div>
                {displayData.meta.duration && (
                  <div>
                    <strong>소요 시간:</strong>{" "}
                    {formatDuration(displayData.meta.duration)}
                  </div>
                )}
                <div className="summary">
                  <strong>요약:</strong>
                  <span>총 {displayData.meta.footer.summary.total}개</span>
                  <span className="success">
                    ✅ {displayData.meta.footer.summary.success}
                  </span>
                  <span className="failed">
                    ❌ {displayData.meta.footer.summary.failed}
                  </span>
                  <span>
                    일치율 {displayData.meta.footer.summary.match_rate}%
                  </span>
                </div>
              </div>
            )}

            {displayData.meta.incomplete && (
              <div className="warning">
                ⚠️ 작업이 정상적으로 완료되지 않았습니다
              </div>
            )}
          </section>
        )}

        {/* 상품 비교 결과 */}
        {displayData?.products && displayData.products.length > 0 && (
          <section className="products-section">
            <div className="products-header">
              <h2>🛍️ 상품 비교 결과</h2>
              <div className="filter-controls">
                <label className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={filterMismatchOnly}
                    onChange={(e) => setFilterMismatchOnly(e.target.checked)}
                  />
                  불일치만 보기 ({mismatchCount}개)
                </label>
                <span className="total-info">
                  전체: {displayData.products.length}개 | 표시:{" "}
                  {filteredProducts.length}개
                </span>
              </div>
            </div>

            <div className="table-container">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>번호</th>
                    <th>상태</th>
                    <th>상품명</th>
                    <th>썸네일</th>
                    <th>정가</th>
                    <th>할인가</th>
                    <th>판매상태</th>
                    <th>링크</th>
                    <th>바로가기</th>
                    <th>product_set_id</th>
                  </tr>
                </thead>
                <tbody>
                  {currentProducts.map((product, idx) => (
                    <tr
                      key={startIndex + idx}
                      className={product.match ? "match-row" : "mismatch-row"}
                    >
                      <td>{startIndex + idx + 1}</td>
                      <td className="status-cell">
                        {product.match ? "✅" : "❌"}
                      </td>
                      <td className="product-name-cell">
                        {product.fetch === null ? (
                          <div className="diff">
                            <div className="db-value">
                              DB: {product.db.product_name}
                            </div>
                            <div className="fetch-value">Fetch: ❌ 실패</div>
                          </div>
                        ) : (
                          <div
                            className={
                              product.comparison.product_name ? "" : "diff"
                            }
                          >
                            <div className="db-value">
                              DB: {product.db.product_name}
                            </div>
                            {!product.comparison.product_name && (
                              <div className="fetch-value">
                                Fetch: {product.fetch.product_name}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="thumbnail-cell">
                        {product.fetch === null ? (
                          <div className="diff">❌ 실패</div>
                        ) : (
                          <div
                            className={
                              product.comparison.thumbnail ? "" : "diff"
                            }
                          >
                            {product.db.thumbnail ===
                            product.fetch.thumbnail ? (
                              <div>✅ 동일</div>
                            ) : (
                              <div
                                className="clickable"
                                onClick={() =>
                                  showThumbnailDiff(
                                    product.db.thumbnail,
                                    product.fetch.thumbnail,
                                  )
                                }
                              >
                                ⚠️ 다름
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="price-cell">
                        {product.fetch === null ? (
                          <div className="diff">
                            <div className="db-value">
                              {product.db.original_price.toLocaleString()}원
                            </div>
                            <div className="fetch-value">❌ 실패</div>
                          </div>
                        ) : (
                          <div
                            className={
                              product.comparison.original_price ? "" : "diff"
                            }
                          >
                            <div className="db-value">
                              {product.db.original_price.toLocaleString()}원
                            </div>
                            {!product.comparison.original_price && (
                              <div className="fetch-value">
                                {product.fetch.original_price.toLocaleString()}
                                원
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="price-cell">
                        {product.fetch === null ? (
                          <div className="diff">
                            <div className="db-value">
                              {product.db.discounted_price.toLocaleString()}원
                            </div>
                            <div className="fetch-value">❌ 실패</div>
                          </div>
                        ) : (
                          <div
                            className={
                              product.comparison.discounted_price ? "" : "diff"
                            }
                          >
                            <div className="db-value">
                              {product.db.discounted_price.toLocaleString()}원
                            </div>
                            {!product.comparison.discounted_price && (
                              <div className="fetch-value">
                                {product.fetch.discounted_price.toLocaleString()}
                                원
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="status-value-cell">
                        {product.fetch === null ? (
                          <div className="diff">
                            <div className="db-value">
                              {product.db.sale_status}
                            </div>
                            <div className="fetch-value">❌ 실패</div>
                          </div>
                        ) : (
                          <div
                            className={
                              product.comparison.sale_status ? "" : "diff"
                            }
                          >
                            <div className="db-value">
                              {product.db.sale_status}
                            </div>
                            {!product.comparison.sale_status && (
                              <div className="fetch-value">
                                {product.fetch.sale_status}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="link-cell">
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          🔗
                        </a>
                      </td>
                      <td className="link-cell">
                        <a
                          href={`https://magpie.scoob.beauty/admin/products/${product.product_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          🏠
                        </a>
                      </td>
                      <td
                        className="product-set-id-cell clickable"
                        onClick={() => copyToClipboard(product.product_set_id)}
                      >
                        {product.product_set_id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  &laquo; 처음
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  &lsaquo; 이전
                </button>
                <span className="page-info">
                  {currentPage} / {totalPages} 페이지
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  다음 &rsaquo;
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  마지막 &raquo;
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
