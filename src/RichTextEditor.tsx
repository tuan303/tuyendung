import React, { useEffect, useRef } from 'react';
import { safeExternalUrl, sanitizeRichHtml } from './lib/safeHtml';

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  modules?: unknown;
  theme?: string;
};

const commands = [
  ['bold', 'Đậm', 'B'],
  ['italic', 'Nghiêng', 'I'],
  ['underline', 'Gạch chân', 'U'],
  ['insertUnorderedList', 'Danh sách dấu đầu dòng', '• Danh sách'],
  ['insertOrderedList', 'Danh sách đánh số', '1. Danh sách'],
  ['removeFormat', 'Xóa định dạng', 'Xóa định dạng'],
] as const;

/** A small native editor: only the same safe formatting shown on public jobs is saved. */
export default function RichTextEditor({ value, onChange, placeholder, className = '' }: Props) {
  const editor = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    if (editor.current && value !== lastEmitted.current) {
      editor.current.innerHTML = sanitizeRichHtml(value);
    }
  }, [value]);

  const emitChange = () => {
    if (!editor.current) return;
    const html = sanitizeRichHtml(editor.current.innerHTML);
    lastEmitted.current = html;
    onChange(html);
  };

  const command = (name: string, argument?: string) => {
    editor.current?.focus();
    document.execCommand(name, false, argument);
    emitChange();
  };

  return (
    <div className={`overflow-hidden rounded-lg border border-gray-300 bg-white ${className}`}>
      <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 p-2" role="toolbar" aria-label="Định dạng nội dung">
        {commands.map(([name, label, text]) => (
          <button key={name} type="button" aria-label={label} title={label} onMouseDown={(event) => event.preventDefault()} onClick={() => command(name)} className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-blue-600">{text}</button>
        ))}
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
          const entered = window.prompt('Nhập liên kết bắt đầu bằng https:// hoặc http://');
          if (entered === null) return;
          const url = safeExternalUrl(entered);
          if (!url) { window.alert('Liên kết không hợp lệ. Chỉ chấp nhận http:// và https://.'); return; }
          command('createLink', url);
        }} className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-200">Liên kết</button>
      </div>
      <div ref={editor} contentEditable suppressContentEditableWarning role="textbox" aria-label={placeholder || 'Nội dung tuyển dụng'} aria-multiline="true" data-placeholder={placeholder} className="prose prose-sm min-h-40 max-w-none p-3 outline-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]"
        onInput={emitChange}
        onBlur={() => {
          if (editor.current) editor.current.innerHTML = sanitizeRichHtml(editor.current.innerHTML);
          emitChange();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const html = event.clipboardData.getData('text/html');
          if (html) command('insertHTML', sanitizeRichHtml(html));
          else command('insertText', event.clipboardData.getData('text/plain'));
        }}
        onDrop={(event) => { event.preventDefault(); }}
      />
    </div>
  );
}
