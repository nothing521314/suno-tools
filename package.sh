#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  package.sh — Đóng gói ứng dụng để phân phối
#  Loại trừ mọi file trong .gitignore
# ============================================================

APP_NAME="suno-tool"
VERSION=$(date +"%Y%m%d_%H%M")
OUTPUT_DIR="$(pwd)/dist"
ARCHIVE_NAME="${APP_NAME}_${VERSION}.zip"
ARCHIVE_PATH="${OUTPUT_DIR}/${ARCHIVE_NAME}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Màu sắc terminal
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_step() { echo -e "\n${CYAN}[•] $1${NC}"; }
print_ok()   { echo -e "  ${GREEN}✅ $1${NC}"; }
print_warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }
print_err()  { echo -e "  ${RED}❌ $1${NC}"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🎵  SUNO TOOL — ĐÓNG GÓI ỨNG DỤNG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ============================================================
# Kiểm tra công cụ
# ============================================================
print_step "Kiểm tra công cụ cần thiết..."

if ! command -v zip &>/dev/null; then
    print_err "Lệnh 'zip' chưa cài. Hãy chạy: brew install zip"
    exit 1
fi
print_ok "zip đã sẵn sàng"

# ============================================================
# Tạo thư mục dist/
# ============================================================
print_step "Chuẩn bị thư mục đầu ra..."

mkdir -p "${OUTPUT_DIR}"
print_ok "Thư mục dist/ đã sẵn sàng"

# ============================================================
# Thu thập các pattern loại trừ từ .gitignore + mặc định
# ============================================================
print_step "Đọc danh sách loại trừ từ .gitignore..."

# Các pattern mặc định luôn loại trừ
EXCLUDES=(
    ".git/*"
    ".DS_Store"
    "**/.DS_Store"
    "__pycache__/*"
    "**/__pycache__/*"
    "*.py[cod]"
    "*.egg-info/*"
    "dist/*"          # tránh đóng gói chính nó
    "*.log"
    "downloads/*"
    "final_merged/*"
    "suno_ready/*"
    "audio-data.json"
    "output_audio/*"
    "suno-id-manager/*"
    "scratch/*"
    "shazam_processor.py"
    "suno_prompt_expert.md"
)

# Đọc thêm từ .gitignore
if [[ -f "${SCRIPT_DIR}/.gitignore" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Bỏ qua dòng trống và comment
        [[ -z "$line" || "$line" == \#* ]] && continue
        # Chuẩn hoá pattern (thêm wildcard nếu là thư mục)
        pattern="${line%/}"   # bỏ trailing slash
        EXCLUDES+=("${pattern}/*" "${pattern}")
    done < "${SCRIPT_DIR}/.gitignore"
    print_ok "Đọc .gitignore thành công"
else
    print_warn ".gitignore không tìm thấy, chỉ dùng pattern mặc định"
fi

# Chuyển thành tham số --exclude cho zip
EXCLUDE_ARGS=()
for pattern in "${EXCLUDES[@]}"; do
    EXCLUDE_ARGS+=("--exclude" "*/${pattern}" "--exclude" "${pattern}")
done

# ============================================================
# Đóng gói
# ============================================================
print_step "Đang tạo archive: ${ARCHIVE_NAME}..."

# Chạy zip từ thư mục cha để archive có tên thư mục gốc bên trong
PARENT_DIR="$(dirname "${SCRIPT_DIR}")"
DIR_NAME="$(basename "${SCRIPT_DIR}")"

(cd "${PARENT_DIR}" && zip -r "${ARCHIVE_PATH}" "${DIR_NAME}" \
    "${EXCLUDE_ARGS[@]}" \
    --exclude "*/${DIR_NAME}/dist/*" \
    -q)

# ============================================================
# Thống kê kết quả
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -f "${ARCHIVE_PATH}" ]]; then
    FILE_SIZE=$(du -sh "${ARCHIVE_PATH}" | cut -f1)
    FILE_COUNT=$(unzip -l "${ARCHIVE_PATH}" | tail -1 | awk '{print $2}')

    print_ok "Đóng gói thành công!"
    echo ""
    echo "  📦 File  : ${ARCHIVE_PATH}"
    echo "  📏 Kích thước : ${FILE_SIZE}"
    echo "  📄 Số files   : ${FILE_COUNT} files"
    echo ""
    echo "  Nội dung bên trong:"
    unzip -l "${ARCHIVE_PATH}" | awk 'NR>3 && NF>3 {
        size=$1; name=$4
        printf "    %-50s %s\n", name, size
    }' | head -30

    TOTAL=$(unzip -l "${ARCHIVE_PATH}" | tail -1 | awk '{print $2}')
    if [[ $TOTAL -gt 30 ]]; then
        echo "    ... và $((TOTAL - 30)) files khác"
    fi
else
    print_err "Tạo file thất bại!"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
