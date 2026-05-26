import React from "react";

export default function ConfirmButton({ confirmText, onConfirm, children, ...props }) {
  const handleClick = async () => {
    if (!window.confirm(confirmText || "确认继续吗？")) return;
    await onConfirm?.();
  };

  return (
    <button {...props} onClick={handleClick}>
      {children}
    </button>
  );
}
