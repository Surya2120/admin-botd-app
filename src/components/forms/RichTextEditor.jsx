import { useRef } from "react";

const commands = [
  { label: "B", command: "bold" },
  { label: "I", command: "italic" },
  { label: "U", command: "underline" },
  { label: "List", command: "insertUnorderedList" },
  { label: "H3", command: "formatBlock", value: "h3" },
  { label: "P", command: "formatBlock", value: "p" }
];

export function RichTextEditor({ value, onChange }) {
  const editorRef = useRef(null);

  function runCommand(command, commandValue) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current?.innerHTML || "");
  }

  return (
    <div className="rich-editor">
      <div className="editor-toolbar">
        {commands.map((item) => (
          <button
            key={item.label}
            type="button"
            className="toolbar-button"
            onClick={() => runCommand(item.command, item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        className="editor-surface"
        contentEditable
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: value }}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
      />
    </div>
  );
}
