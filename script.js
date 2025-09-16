class PDFCompressor {
    constructor() {
        this.currentFile = null;
        this.compressedPdfBytes = null;
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');

        this.fileInfo = document.getElementById('fileInfo');
        this.fileName = document.getElementById('fileName');
        this.fileSize = document.getElementById('fileSize');
        this.removeFile = document.getElementById('removeFile');

        this.compressionOptions = document.getElementById('compressionOptions');

        this.compressBtn = document.getElementById('compressBtn');
        this.clearBtn = document.getElementById('clearBtn');

        this.progressSection = document.getElementById('progressSection');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');

        this.downloadSection = document.getElementById('downloadSection');
        this.originalSize = document.getElementById('originalSize');
        this.compressedSize = document.getElementById('compressedSize');
        this.reductionPercent = document.getElementById('reductionPercent');
        this.downloadBtn = document.getElementById('downloadBtn');
    }

    bindEvents() {
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));

        this.removeFile.addEventListener('click', () => this.clearFile());
        this.compressBtn.addEventListener('click', () => this.compressPDF());
        this.clearBtn.addEventListener('click', () => this.clearFile());
        this.downloadBtn.addEventListener('click', () => this.downloadCompressedPDF());
    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) this.processFile(files[0]);
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) this.processFile(file);
    }

    processFile(file) {
        if (file.type !== 'application/pdf') {
            this.showError('Por favor, selecione apenas arquivos PDF.');
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            this.showError('O arquivo é muito grande. Tamanho máximo: 50MB.');
            return;
        }

        this.currentFile = file;
        this.showFileInfo(file);
        this.showCompressionOptions();
        this.enableCompressButton();
    }

    showFileInfo(file) {
        this.fileName.textContent = file.name;
        this.fileSize.textContent = this.formatFileSize(file.size);
        this.uploadArea.style.display = 'none';
        this.fileInfo.style.display = 'block';
    }

    showCompressionOptions() {
        this.compressionOptions.style.display = 'block';
    }

    enableCompressButton() {
        this.compressBtn.disabled = false;
        this.clearBtn.style.display = 'inline-flex';
    }

    clearFile() {
        this.currentFile = null;
        this.compressedPdfBytes = null;
        this.fileInput.value = '';
        this.uploadArea.style.display = 'block';
        this.fileInfo.style.display = 'none';
        this.compressionOptions.style.display = 'none';
        this.progressSection.style.display = 'none';
        this.downloadSection.style.display = 'none';
        this.compressBtn.disabled = true;
        this.clearBtn.style.display = 'none';
        this.progressFill.style.width = '0%';
    }

    async compressPDF() {
        if (!this.currentFile) return;

        try {
            this.showProgress();
            this.updateProgress(10, 'Carregando arquivo PDF...');

            const arrayBuffer = await this.readFileAsArrayBuffer(this.currentFile);
            this.updateProgress(30, 'Analisando estrutura do PDF...');

            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            this.updateProgress(50, 'Aplicando compressão...');

            const compressionLevel = this.getCompressionLevel();
            await this.applyCompression(pdfDoc, compressionLevel);

            this.updateProgress(100, 'Compressão concluída!');
            setTimeout(() => this.showDownloadSection(), 500);

        } catch (error) {
            console.error('Erro na compressão:', error);
            this.showError('Erro ao comprimir o PDF. Tente novamente.');
            this.hideProgress();
        }
    }

    // Método applyCompression substituído
    async applyCompression(pdfDoc, level) {
        const settings = {
            low: { quality: 0.85, dpi: 150 },
            medium: { quality: 0.65, dpi: 120 },
            high: { quality: 0.4, dpi: 90 }
        };
        const config = settings[level] || settings.medium;

        // Remover metadados
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');

        // Salvar PDF original para usar no PDF.js
        const pdfBytes = await pdfDoc.save();
        const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
        const pdfUrl = URL.createObjectURL(pdfBlob);

        const pdfjsLib = window['pdfjs-dist/build/pdf'];
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;

        const newPdfDoc = await PDFLib.PDFDocument.create();

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: config.dpi / 72 });

            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");

            await page.render({ canvasContext: ctx, viewport }).promise;

            const imgData = canvas.toDataURL("image/jpeg", config.quality);
            const jpgImage = await newPdfDoc.embedJpg(imgData);
            const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);

            newPage.drawImage(jpgImage, {
                x: 0,
                y: 0,
                width: viewport.width,
                height: viewport.height
            });

            this.updateProgress(
                Math.round((i / pdf.numPages) * 100),
                `Comprimindo página ${i}/${pdf.numPages}...`
            );
        }

        let compressedBytes = await newPdfDoc.save();

        // 🚨 Evitar "bug" → Se ficou maior que o original, usa o original
        if (compressedBytes.length > this.currentFile.size) {
            console.warn("Compressão não reduziu, mantendo arquivo original.");
            compressedBytes = pdfBytes;
        }

        this.compressedPdfBytes = compressedBytes;
    }

    getCompressionLevel() {
        const selectedOption = document.querySelector('input[name="compression"]:checked');
        return selectedOption ? selectedOption.value : 'medium';
    }

    showProgress() {
        this.progressSection.style.display = 'block';
        this.compressBtn.disabled = true;
    }

    hideProgress() {
        this.progressSection.style.display = 'none';
        this.compressBtn.disabled = false;
    }

    updateProgress(percent, text) {
        this.progressFill.style.width = percent + '%';
        this.progressText.textContent = text;
    }

    showDownloadSection() {
        const originalSizeBytes = this.currentFile.size;
        const compressedSizeBytes = this.compressedPdfBytes.length;
        const reduction = ((originalSizeBytes - compressedSizeBytes) / originalSizeBytes * 100);

        this.originalSize.textContent = this.formatFileSize(originalSizeBytes);
        this.compressedSize.textContent = this.formatFileSize(compressedSizeBytes);
        this.reductionPercent.textContent = reduction.toFixed(1) + '%';

        this.hideProgress();
        this.downloadSection.style.display = 'block';
    }

    downloadCompressedPDF() {
        if (!this.compressedPdfBytes) return;

        const blob = new Blob([this.compressedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = this.getCompressedFileName();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    }

    getCompressedFileName() {
        if (!this.currentFile) return 'compressed.pdf';
        const name = this.currentFile.name;
        const nameWithoutExt = name.substring(0, name.lastIndexOf('.'));
        return `${nameWithoutExt}_comprimido.pdf`;
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-notification';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <span>${message}</span>
        `;
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 500;
            animation: slideIn 0.3s ease;
        `;
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(errorDiv);
        setTimeout(() => {
            errorDiv.remove();
            style.remove();
        }, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PDFCompressor();
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, preventDefaults, false);
    });
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    document.documentElement.style.scrollBehavior = 'smooth';
});
