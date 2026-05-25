import React, { useState } from "react";
import { copyText } from "../utils";

export default function CopyButton({ value, label = "复制", successLabel = "已复制", className = "" }) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button type="button" className={className} onClick={handleClick}>
      {copied ? successLabel : label}
    </button>
  );
}
