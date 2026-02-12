document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileListContainer = document.getElementById('file-list-container');
    const fileListElement = document.getElementById('file-list');
    const mergeBtn = document.getElementById('merge-btn');
    const clearBtn = document.getElementById('clear-all');
    const resultArea = document.getElementById('result-area');
    const downloadLink = document.getElementById('download-link');

    let files = []; // Stores file objects {name, pages}

    // SortableJS setup
    const sortable = new Sortable(fileListElement, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: () => {
            // Update internal files array based on new DOM order
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
        const formData = new FormData();
        let hasPdf = false;

        Array.from(uploadedFiles).forEach(file => {
            if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                formData.append('files', file);
                hasPdf = true;
            }
        });

        if (!hasPdf) return;

        // Upload to server
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
            li.innerHTML = `
                <div class="file-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                </div>
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-pages">${file.pages} pages</span>
                </div>
                <input type="text" class="page-range-input" placeholder="e.g. 1-5, 8" value="${file.ranges || ''}" onchange="updateRange('${file.name}', this.value)">
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
        // Optional: call /cleanup on server
        fetch('/cleanup', { method: 'POST' });
    });

    mergeBtn.addEventListener('click', () => {
        if (files.length === 0) return;

        mergeBtn.classList.add('loading');
        mergeBtn.disabled = true;

        // Send structured data including ranges
        const filesData = files.map(f => ({
            filename: f.name,
            ranges: f.ranges || ''
        }));

        fetch('/merge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ files: filesData })
        })
            .then(response => response.json())
            .then(data => {
                if (data.download_url) {
                    downloadLink.href = data.download_url;
                    downloadLink.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download Merged PDF
                `;
                    resultArea.style.display = 'block';
                    resultArea.scrollIntoView({ behavior: 'smooth' });
                } else if (data.error) {
                    alert('Error: ' + data.error);
                }
            })
            .catch(err => {
                console.error(err);
                alert('An error occurred while merging.');
            })
            .finally(() => {
                mergeBtn.classList.remove('loading');
                mergeBtn.disabled = false;
            });
    });
});
