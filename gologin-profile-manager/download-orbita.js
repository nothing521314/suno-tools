const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function downloadManual() {
  const majorVersion = '146'; // Phiên bản mới nhất

  // Link tải chuẩn từ GoLogin SDK dành cho Mac M1/M2/M3 (ARM)
  const url = `https://orbita-browser-mac-arm.gologin.com/orbita-browser-latest-${majorVersion}.tar.gz`;

  const downloadDir = path.join(os.homedir(), '.gologin', 'browser');
  const tarPath = path.join(downloadDir, `orbita-${majorVersion}.tar.gz`);
  const extractDir = path.join(downloadDir, `orbita-browser-${majorVersion}`);

  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  console.log(`[Step 1] Đang tải Orbita ${majorVersion} cho Mac (ARM/Silicon)...`);
  console.log(`URL: ${url}`);

  try {
    // 1. Tải file bằng curl
    execSync(`curl -L "${url}" -o "${tarPath}"`, { stdio: 'inherit' });

    console.log('\n[Step 2] Đang giải nén file .tar.gz...');
    if (fs.existsSync(extractDir)) {
      console.log('Đang xóa thư mục cũ...');
      fs.rmSync(extractDir, { recursive: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    // 2. Giải nén bằng lệnh tar (mặc định có trên Mac)
    execSync(`tar -xzf "${tarPath}" -C "${extractDir}"`, { stdio: 'inherit' });

    console.log('[Step 3] Đang dọn dẹp file tạm...');
    fs.unlinkSync(tarPath);

    console.log('\n[Xong] Orbita Browser đã sẵn sàng tại:');
    console.log(extractDir);

    console.log('\n[QUAN TRỌNG]:');
    console.log('1. Hãy mở file "zutils.js"');
    console.log('2. Tìm dòng: const DEFAULT_BROWSER_VERSION = 144;');
    console.log('3. Sửa thành: const DEFAULT_BROWSER_VERSION = 146;');

  } catch (error) {
    console.error('Lỗi trong quá trình xử lý:', error.message);
  }
}

downloadManual();
