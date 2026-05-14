const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function downloadManual() {
  const majorVersion = '146'; // Phiên bản mới nhất
  const arch = os.arch(); // 'arm64' cho M1/M2/M3 hoặc 'x64' cho Intel
  const isArm = arch === "arm64";

  // Tự động chọn Link tải dựa trên loại chip
  const url = isArm
    ? `https://orbita-browser-mac-arm.gologin.com/orbita-browser-latest-${majorVersion}.tar.gz` // Link ARM
    : `https://orbita-browser-mac.gologin.com/orbita-browser-latest-${majorVersion}.tar.gz`; // Link Intel

  const downloadDir = path.join(os.homedir(), ".gologin", "browser");
  const tarPath = path.join(downloadDir, `orbita-${majorVersion}.tar.gz`);
  const extractDir = path.join(downloadDir, `orbita-browser-${majorVersion}`);

  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  console.log(
    `[Hệ thống] Phát hiện kiến trúc: ${isArm ? "Apple Silicon (ARM)" : "Intel (x64)"}`,
  );
  console.log(`[Step 1] Đang tải Orbita ${majorVersion} cho Mac...`);
  console.log(`URL: ${url}`);

  try {
    // 1. Tải file bằng curl
    execSync(`curl -L "${url}" -o "${tarPath}"`, { stdio: "inherit" });

    console.log("\n[Step 2] Đang giải nén file .tar.gz...");
    if (fs.existsSync(extractDir)) {
      console.log("Đang xóa thư mục cũ...");
      fs.rmSync(extractDir, { recursive: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    // 2. Giải nén bằng lệnh tar (mặc định có trên Mac)
    execSync(`tar -xzf "${tarPath}" -C "${extractDir}"`, { stdio: "inherit" });

    console.log("[Step 3] Đang dọn dẹp file tạm...");
    fs.unlinkSync(tarPath);

    console.log("\n[Xong] Orbita Browser đã sẵn sàng tại:");
    console.log(extractDir);

    console.log("\n[HƯỚNG DẪN TIẾP THEO]:");
    console.log("1. Chạy lệnh sau để cấp quyền cho browser:");
    console.log(
      `   xattr -rd com.apple.quarantine ${extractDir}/Orbita-Browser.app`,
    );
    console.log(
      `   chmod -R +x ${extractDir}/Orbita-Browser.app/Contents/MacOS/Orbita`,
    );
    console.log(
      "\n2. Cập nhật DEFAULT_BROWSER_VERSION = 146 trong file zutils.js",
    );
  } catch (error) {
    console.error("Lỗi trong quá trình xử lý:", error.message);
  }
}

downloadManual();
