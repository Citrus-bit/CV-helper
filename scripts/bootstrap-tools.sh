#!/usr/bin/env bash
set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_directory="$(cd "${script_directory}/.." && pwd)"
typst_version="${TYPST_VERSION:-0.15.1}"
install_directory="${project_directory}/.tools/typst"
binary_path="${install_directory}/typst"
ocr_install_directory="${project_directory}/.tools/tesseract"

install_ocr_model() {
  local language="$1"
  local expected_checksum="$2"
  local model_path="${ocr_install_directory}/${language}.traineddata.gz"
  local download_url="https://cdn.jsdelivr.net/npm/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz"

  if [[ -f "${model_path}" ]] && [[ "$(shasum -a 256 "${model_path}" | awk '{print $1}')" == "${expected_checksum}" ]]; then
    echo "Tesseract ${language} model is already installed at ${model_path}"
    return
  fi

  local temporary_model
  temporary_model="$(mktemp "${TMPDIR:-/tmp}/resume-ocr-${language}.XXXXXX")"
  if ! curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
    "${download_url}" --output "${temporary_model}"; then
    rm -f "${temporary_model}"
    return 1
  fi
  local actual_checksum
  actual_checksum="$(shasum -a 256 "${temporary_model}" | awk '{print $1}')"
  if [[ "${actual_checksum}" != "${expected_checksum}" ]]; then
    rm -f "${temporary_model}"
    echo "Tesseract ${language} checksum verification failed" >&2
    return 1
  fi
  mkdir -p "${ocr_install_directory}"
  install -m 0644 "${temporary_model}" "${model_path}"
  rm -f "${temporary_model}"
}

install_ocr_model "chi_sim" "b8a23f10c7de500891eb458a8adc9cc58ab7f242f08b7d149f5e9aea4ad5db7c"
install_ocr_model "eng" "45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91"

if [[ -x "${binary_path}" ]] && "${binary_path}" --version | grep -q "^typst ${typst_version} "; then
  echo "Typst ${typst_version} is already installed at ${binary_path}"
  exit 0
fi

case "$(uname -s)" in
  Darwin) platform="apple-darwin" ;;
  Linux) platform="unknown-linux-musl" ;;
  *) echo "Unsupported operating system: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  x86_64|amd64) architecture="x86_64" ;;
  arm64|aarch64) architecture="aarch64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

target="${architecture}-${platform}"
archive_name="typst-${target}.tar.xz"
download_url="https://github.com/typst/typst/releases/download/v${typst_version}/${archive_name}"
temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/resume-typst.XXXXXX")"
trap 'rm -rf "${temporary_directory:?}"' EXIT

case "${target}" in
  aarch64-apple-darwin) expected_checksum="48f62ed034aa3a7978309579ac6ca00045e2ef0da73114e8af27cfd8e74dc05a" ;;
  x86_64-apple-darwin) expected_checksum="7f9fdd9584866245de9a79e0add8f9236fae6f40a8a45e2c4771ccc14db4e0fa" ;;
  aarch64-unknown-linux-musl) expected_checksum="5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee" ;;
  x86_64-unknown-linux-musl) expected_checksum="a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c" ;;
  *) echo "No checksum is registered for ${target}" >&2; exit 1 ;;
esac
expected_checksum="${TYPST_SHA256:-${expected_checksum}}"

echo "Downloading Typst ${typst_version} for ${target}"
curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
  "${download_url}" --output "${temporary_directory}/typst.tar.xz"

if command -v sha256sum >/dev/null 2>&1; then
  printf '%s  %s\n' "${expected_checksum}" "${temporary_directory}/typst.tar.xz" | sha256sum --check --status
else
  actual_checksum="$(shasum -a 256 "${temporary_directory}/typst.tar.xz" | awk '{print $1}')"
  [[ "${actual_checksum}" == "${expected_checksum}" ]] || { echo "Typst checksum verification failed" >&2; exit 1; }
fi

mkdir -p "${temporary_directory}/extracted" "${install_directory}"
tar --extract --xz --file "${temporary_directory}/typst.tar.xz" \
  --strip-components=1 --directory "${temporary_directory}/extracted"
install -m 0755 "${temporary_directory}/extracted/typst" "${binary_path}"
for metadata_file in LICENSE NOTICE README.md; do
  if [[ -f "${temporary_directory}/extracted/${metadata_file}" ]]; then
    install -m 0644 "${temporary_directory}/extracted/${metadata_file}" "${install_directory}/${metadata_file}"
  fi
done

"${binary_path}" --version
