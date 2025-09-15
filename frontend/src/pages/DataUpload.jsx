import React, { useState } from 'react';
import axios from 'axios';
import '../styles/DataUpload.css';

const DataUpload = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFilename, setUploadedFilename] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setUploadResult(null);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'text/csv' || droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile);
        setUploadResult(null);
      } else {
        alert('Please upload only CSV files');
      }
    }
  };

  // const handleUpload = async (e) => {
  //   e.preventDefault();
  //   if (!file) return;

  //   setUploading(true);
  //   const formData = new FormData();
  //   formData.append('salesData', file);

  //   try {
  //     const response = await axios.post('http://localhost:5000/api/upload', formData, {
  //       headers: { 'Content-Type': 'multipart/form-data' },
  //     });
  //     setUploadResult(response.data);
  //     setFile(null);
  //     // Reset form
  //     const fileInput = document.getElementById('file-input');
  //     if (fileInput) fileInput.value = '';
  //   } catch (error) {
  //     console.error('Upload error:', error);
  //     const errorMessage = error.response?.data?.error || error.message || 'Upload failed';
  //     setUploadResult({
  //       error: true,
  //       message: errorMessage
  //     });
  //   } finally {
  //     setUploading(false);
  //   }
  // };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('salesData', file);

    try {
      const response = await axios.post('http://localhost:5000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // ✅ Save uploaded filename
      if (response.data.filename) {
        localStorage.setItem("uploadedFilename", response.data.filename);
      }

      alert("Upload success!");
    } catch (error) {
      alert("Upload failed: " + error.message);
    }
  };


  return (
    <div className="data-upload">
      <div className="upload-header">
        <h1>📁 Upload Sales Data</h1>
        <p>Upload your CSV files to analyze pharmaceutical sales data</p>
      </div>

      <div className="upload-section">
        <form onSubmit={handleUpload}>
          <div
            className={`file-drop-area ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              id="file-input"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              required
            />

            <div className="file-drop-content">
              {file ? (
                <div className="file-selected">
                  <div className="file-icon">📄</div>
                  <div className="file-info">
                    <p className="file-name">{file.name}</p>
                    <p className="file-size">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="file-remove"
                  >
                    ❌
                  </button>
                </div>
              ) : (
                <div className="file-drop-placeholder">
                  <div className="upload-icon">📤</div>
                  <p>Drag and drop your CSV file here</p>
                  <p>or</p>
                  <button
                    type="button"
                    onClick={() => document.getElementById('file-input').click()}
                    className="browse-btn"
                  >
                    Browse Files
                  </button>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={uploading || !file}
            className="upload-btn"
          >
            {uploading ? (
              <>
                <span className="spinner"></span>
                Uploading...
              </>
            ) : (
              <>
                ⬆️ Upload Data
              </>
            )}
          </button>
        </form>

        <div className="data-format-info">
          <h3>📋 Required CSV Format</h3>
          <div className="format-table-container">
            <table className="format-table">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Description</th>
                  <th>Example</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>datum</code></td>
                  <td>Sale date</td>
                  <td>1/2/2014</td>
                  <td>Date (M/D/YYYY)</td>
                </tr>
                <tr>
                  <td><code>M01AB</code></td>
                  <td>Anti-inflammatory (Acetic acid)</td>
                  <td>0</td>
                  <td>Number</td>
                </tr>
                <tr>
                  <td><code>M01AE</code></td>
                  <td>Anti-inflammatory (Propionic acid)</td>
                  <td>3.67</td>
                  <td>Number</td>
                </tr>
                <tr>
                  <td><code>N02BA</code></td>
                  <td>Analgesics (Salicylic acid)</td>
                  <td>3.4</td>
                  <td>Number</td>
                </tr>
                <tr>
                  <td><code>N02BE</code></td>
                  <td>Analgesics (Pyrazolones)</td>
                  <td>32.4</td>
                  <td>Number</td>
                </tr>
                <tr>
                  <td><code>N05B</code></td>
                  <td>Anxiolytics</td>
                  <td>7</td>
                  <td>Number</td>
                </tr>
                <tr>
                  <td><code>N05C</code></td>
                  <td>Hypnotics and sedatives</td>
                  <td>0</td>
                  <td>Number</td>
                </tr>
                <tr>
                  <td><code>R03</code></td>
                  <td>Respiratory system drugs</td>
                  <td>0</td>
                  <td>Number</td>
                </tr>
                <tr>
                  <td><code>R06</code></td>
                  <td>Antihistamines</td>
                  <td>2</td>
                  <td>Number</td>
                </tr>
                <tr>
                  <td><code>Year</code></td>
                  <td>Year</td>
                  <td>2014</td>
                  <td>Number</td>
                </tr>
                <tr>
                  <td><code>Month</code></td>
                  <td>Month</td>
                  <td>1</td>
                  <td>Number</td>
                </tr>
                <tr>
                  <td><code>Hour</code></td>
                  <td>Hour of day</td>
                  <td>248</td>
                  <td>Number</td>
                </tr>
                <tr>
                  <td><code>Weekday Name</code></td>
                  <td>Day of week</td>
                  <td>Thursday</td>
                  <td>Text</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="format-example">
            <h4>📝 Sample CSV Content:</h4>
            <pre>
              {`datum,M01AB,M01AE,N02BA,N02BE,N05B,N05C,R03,R06,Year,Month,Hour,Weekday Name
1/2/2014,0,3.67,3.4,32.4,7,0,0,2,2014,1,248,Thursday
1/3/2014,8,4,4.4,50.6,16,0,20,4,2014,1,276,Friday
1/4/2014,2,1,6.5,61.85,10,0,9,1,2014,1,276,Saturday`}
            </pre>
          </div>
        </div>

        {uploadResult && (
          <div className="upload-result">
            {uploadResult.error ? (
              <div className="result-error">
                <h3>❌ Upload Failed</h3>
                <p>{uploadResult.message}</p>
              </div>
            ) : (
              <div className="result-success">
                <h3>✅ Upload Successful</h3>
                <div className="result-stats">
                  <div className="stat-item">
                    <span className="stat-label">Records Processed:</span>
                    <span className="stat-value">{uploadResult.recordsProcessed}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Records Inserted:</span>
                    <span className="stat-value">{uploadResult.recordsInserted}</span>
                  </div>
                </div>

                {uploadResult.drugCategories && (
                  <div className="available-categories">
                    <h4>📊 Available Drug Categories:</h4>
                    <div className="categories-pills">
                      {uploadResult.drugCategories.map((category) => (
                        <span key={category} className="category-pill">
                          {category}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {uploadResult.errors && uploadResult.errors.length > 0 && (
                  <div className="result-warnings">
                    <h4>⚠️ Warnings:</h4>
                    <ul>
                      {uploadResult.errors.slice(0, 5).map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                      {uploadResult.errors.length > 5 && (
                        <li>... and {uploadResult.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataUpload;
