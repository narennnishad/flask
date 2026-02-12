document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileListContainer = document.getElementById('file-list-container');
    const fileListElement = document.getElementById('file-list');
    const mergeBtn = document.getElementById('merge-btn');
    const clearBtn = document.getElementById('clear-all');
    const resultArea = document.getElementById('result-area');
    const downloadLink = document.getElementById('download-link');
    const instructionText = document.querySelector('.upload-content h3');
    const btnText = document.querySelector('.btn-text');

    let files = []; // Stores file objects. For merge: {name, pages}. For convert: {name, originalFile}
    let currentMode = 'merge'; // 'merge', 'pdf-to-docx', 'docx-to-pdf'

    // Tab switching
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentMode = tab.dataset.mode;
            files = []; // Clear files on mode switch
            renderFileList();
            updateUI();
        });
    });

    function updateUI() {
        fileInput.value = '';
        resultArea.style.display = 'none';

        if (currentMode === 'merge') {
            instructionText.innerText = 'Drop PDFs here or click to upload';
            btnText.innerText = 'Merge PDFs';
            fileInput.accept = '.pdf';
        } else if (currentMode === 'pdf-to-docx') {
            instructionText.innerText = 'Drop PDF here to convert to Word';
            btnText.innerText = 'Convert to Word';
            fileInput.accept = '.pdf';
        } else if (currentMode === 'docx-to-pdf') {
            instructionText.innerText = 'Drop Word file here to convert to PDF';
            btnText.innerText = 'Convert to PDF';
            fileInput.accept = '.docx';
        }
    }

    // SortableJS setup (only relevant for merge)
    const sortable = new Sortable(fileListElement, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: () => {
            if (currentMode !== 'merge') return;
            const newOrder = [];
            const items = fileListElement.querySelectorAll('.file-item');
            items.forEach(item => {
                const name = item.dataset.filename;
                const file = files.find(f => f.name === name);
                if (file) newOrder.push(file);
            });
            files = newOrder;
        }
    });

    // Drag and drop handlers
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        handleFiles(fileInput.files);
        fileInput.value = ''; // Reset input
    });

    function handleFiles(uploadedFiles) {
        if (currentMode !== 'merge') {
            // For conversion, only allow one file
            files = [];
        }

        const formData = new FormData();
        let validFiles = [];

        Array.from(uploadedFiles).forEach(file => {
            const ext = file.name.toLowerCase().split('.').pop();
            let isValid = false;

            if (currentMode === 'merge' && ext === 'pdf') isValid = true;
            if (currentMode === 'pdf-to-docx' && ext === 'pdf') isValid = true;
            if (currentMode === 'docx-to-pdf' && ext === 'docx') isValid = true;

            if (isValid) {
                if (currentMode === 'merge') {
                    formData.append('files', file);
                    validFiles.push(file);
                } else {
                    // For convert, store locally
                    files = [{
                        name: file.name,
                        originalFile: file,
                        pages: 'Ready to convert'
                    }];
                    renderFileList();
                }
            }
        });

        if (currentMode === 'merge' && validFiles.length > 0) {
            // Upload to server for merge mode
            fetch('/upload', {
                method: 'POST',
                body: formData
            })
                .then(response => response.json())
                .then(data => {
                    if (data.files) {
                        files = [...files, ...data.files];
                        renderFileList();
                    }
                })
                .catch(err => console.error('Upload failed', err));
        }
    }

    function renderFileList() {
        fileListElement.innerHTML = '';

        if (files.length > 0) {
            fileListContainer.style.display = 'block';
            mergeBtn.disabled = false;
        } else {
            fileListContainer.style.display = 'none';
            mergeBtn.disabled = true;
            return;
        }

        files.forEach((file, index) => {
            const li = document.createElement('li');
            li.className = 'file-item';
            li.dataset.filename = file.name;

            let icon = '';
            // Basic icon logic
            icon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

            li.innerHTML = `
                <div class="file-icon">${icon}</div>
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-pages">${file.pages || ''}</span>
                </div>
                ${currentMode === 'merge' ?
                    `<input type="text" class="page-range-input" placeholder="e.g. 1-5, 8" value="${file.ranges || ''}" onchange="updateRange('${file.name}', this.value)">`
                    : ''}
                <button class="remove-btn" onclick="removeFile('${file.name}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;
            fileListElement.appendChild(li);
        });
    }

    window.updateRange = (filename, value) => {
        const file = files.find(f => f.name === filename);
        if (file) {
            file.ranges = value;
        }
    };

    window.removeFile = (filename) => {
        files = files.filter(f => f.name !== filename);
        renderFileList();
    };

    clearBtn.addEventListener('click', () => {
        files = [];
        renderFileList();
        resultArea.style.display = 'none';
        if (currentMode === 'merge') fetch('/cleanup', { method: 'POST' });
    });

    mergeBtn.addEventListener('click', () => {
        if (files.length === 0) return;

        mergeBtn.classList.add('loading');
        mergeBtn.disabled = true;
        resultArea.style.display = 'none';

        if (currentMode === 'merge') {
            const filesData = files.map(f => ({
                filename: f.name,
                ranges: f.ranges || ''
            }));

            fetch('/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: filesData })
            })
                .then(handleResponse)
                .catch(handleError)
                .finally(resetBtn);
        } else {
            // Conversion modes
            const formData = new FormData();
            formData.append('file', files[0].originalFile);

            const endpoint = currentMode === 'pdf-to-docx' ? '/convert/pdf-to-docx' : '/convert/docx-to-pdf';

            fetch(endpoint, {
                method: 'POST',
                body: formData
            })
                .then(handleResponse)
                .catch(handleError)
                .finally(resetBtn);
        }
    });

    function handleResponse(response) {
        return response.json().then(data => {
            if (data.download_url) {
                downloadLink.href = data.download_url;
                downloadLink.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download Result
                `;
                resultArea.style.display = 'block';
                resultArea.scrollIntoView({ behavior: 'smooth' });
            } else if (data.error) {
                alert('Error: ' + data.error);
            }
        });
    }

    function handleError(err) {
        console.error(err);
        alert('An error occurred.');
    }

    function resetBtn() {
        mergeBtn.classList.remove('loading');
        mergeBtn.disabled = false;
    }
});
