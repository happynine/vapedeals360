"use client";

import { useState, useCallback } from "react";
import { Upload, Avatar, Message } from "@arco-design/web-react";

interface LogoUploadProps {
  value: string | null;
  onChange: (url: string) => void;
  recommendedSize?: string;
  label?: string;
}

export default function LogoUpload({
  value,
  onChange,
  recommendedSize,
  label,
}: LogoUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "site");

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (json.success) {
          onChange(json.data.key);
          Message.success("Upload successful");
        } else {
          Message.error("Upload failed: " + json.error);
        }
      } catch {
        Message.error("Upload failed");
      } finally {
        setUploading(false);
      }
      return false; // prevent default upload behavior
    },
    [onChange]
  );

  return (
    <div className="space-y-2">
      {label && (
        <div className="text-xs text-muted-foreground">{label}</div>
      )}
      <div className="flex items-center gap-4">
        <Avatar
          size={64}
          shape="square"
          style={{
            backgroundColor: "transparent",
            border: "1px solid var(--color-border)",
          }}
        >
          {value ? (
            <img
              src={value}
              alt="Logo"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
              N/A
            </div>
          )}
        </Avatar>
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={handleUpload}
          disabled={uploading}
        >
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {uploading ? "Uploading..." : value ? "Change Image" : "Select Image"}
          </button>
        </Upload>
      </div>
      {recommendedSize && (
        <div className="text-xs text-muted-foreground">{recommendedSize}</div>
      )}
    </div>
  );
}
