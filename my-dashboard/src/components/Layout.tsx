import React from "react";

// Lightweight, self-contained versions of the components you provided.
// These avoid external style/analytics dependencies so they can be added safely
// to the existing project. You can replace/integrate styles later.

export interface UploadDatasetButtonProps {
  onUpload: (dataset: string) => void;
}

export function UploadDatasetButton(props: UploadDatasetButtonProps) {
  const inputFileRef = React.useRef<HTMLInputElement | null>(null);
  const handleUploadFileClick = React.useCallback(() => {
    inputFileRef.current?.click?.();
  }, []);
  const handleUploadFile = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();
      const inputFile = e.target.files?.[0];
      if (!inputFile) return;
      const reader = new FileReader();

      reader.onload = function (event) {
        const text = event?.target?.result as string;
        if (text) {
          // We pass raw text back; caller can parse csv/json as needed
          props.onUpload(text);
        }
      };

      reader.readAsText(inputFile);
    },
    [props]
  );

  return (
    <>
      <button onClick={handleUploadFileClick} style={{padding: '6px 10px', borderRadius: 6, cursor: 'pointer'}}>
        Upload Data
      </button>
      <input
        ref={inputFileRef}
        hidden
        type="file"
        onChange={handleUploadFile}
        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
      />
    </>
  );
}

export interface ViewSelectProps {
  value: string;
  onChange?: (value: string) => void;
}

export function ViewSelect(props: ViewSelectProps) {
  const handleChange = React.useCallback(
    (value: string) => {
      return () => {
        // analytics was present in original code; keep behavior minimal here
        props.onChange?.(value);
      };
    },
    [props.onChange]
  );

  return (
    <div style={{display: 'inline-block'}}>
      <strong>View: </strong>
      <label style={{marginLeft: 8}}>
        <input
          checked={props.value === "prompt"}
          type="radio"
          name="view"
          onChange={() => {}}
          onClick={handleChange("prompt")}
        />
        <span style={{marginLeft: 6}}>Prompt</span>
      </label>
      <label style={{marginLeft: 8}}>
        <input
          checked={props.value === "code"}
          type="radio"
          name="view"
          onChange={() => {}}
          onClick={handleChange("code")}
        />
        <span style={{marginLeft: 6}}>Code</span>
      </label>
      <label style={{marginLeft: 8}}>
        <input
          checked={props.value === "dashboard"}
          type="radio"
          name="view"
          onChange={() => {}}
          onClick={handleChange("dashboard")}
        />
        <span style={{marginLeft: 6}}>Dashboard</span>
      </label>
    </div>
  );
}

export function TextInput(props: any) {
  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (props.type === "text" || props.type === "textarea") props.onChange?.(e.target.value);
      else props.onChange?.(parseInt(e.target.value || "", 10));
    },
    [props.onChange, props.type]
  );

  return (
    <div style={{marginBottom: 8}}>
      {props.label && <div style={{marginBottom: 6}}>{props.label}</div>}
      {props.type === "textarea" ? (
        <textarea onChange={handleChange} value={props.value || ""} style={{width: '100%'}} />
      ) : (
        <input type={props.type} onChange={handleChange} value={props.value as any} />
      )}
    </div>
  );
}

export function TextAreaInput(props: any) {
  const ref = React.createRef<HTMLTextAreaElement>();

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      props.onChange?.(e.target.value);
    },
    [props.onChange]
  );
  return (
    <div style={{marginBottom: 8}}>
      {props.label && <div style={{marginBottom: 6}}>{props.label}</div>}
      <textarea ref={ref} onChange={handleChange} value={props.value || ""} disabled={props.disabled} style={{width: '100%'}} />
    </div>
  );
}

export function Dropdown(props: any) {
  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      props.onChange?.(e.target.value);
    },
    [props.onChange]
  );

  return (
    <div style={{marginBottom: 8}}>
      {props.title && <label style={{display: 'block', marginBottom: 6}}>{props.title}</label>}
      <select value={props.value || (props.options && props.options[0])} onChange={handleChange}>
        {props.options?.map((value: string, idx: number) => (
          <option key={idx} value={value}>
            {value}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MissingApiKeyMessage(props: { onApiKeyClick?: () => void; onRandomData?: () => void }) {
  return (
    <div style={{padding: 12, textAlign: 'center'}}>
      <div>
        To start analyzing your data,
        <button onClick={props.onApiKeyClick} style={{marginLeft: 6, color: '#2563eb'}}> set up your OpenAI API Key</button>
        <div style={{marginTop: 8}}>
          or
          <button onClick={props.onRandomData} style={{marginLeft: 6, background: '#7c3aed', color: '#fff', padding: '6px 10px', borderRadius: 6}}>try it with random data</button>
        </div>
      </div>
    </div>
  );
}

export function Loader() {
  return (
    <div style={{position: 'relative', padding: 24, textAlign: 'center'}}>
      <div style={{opacity: 0.8}}>Processing... It might take several seconds</div>
      <div style={{marginTop: 12}}>
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 100 100" fill="#6e7086">
          <circle cx="20" cy="50" r="6">
            <animate attributeName="opacity" values="0;1;0" dur="1s" repeatCount="indefinite" />
          </circle>
          <circle cx="40" cy="50" r="6">
            <animate attributeName="opacity" values="0;1;0" dur="1s" begin="0.25s" repeatCount="indefinite" />
          </circle>
          <circle cx="60" cy="50" r="6">
            <animate attributeName="opacity" values="0;1;0" dur="1s" begin="0.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="80" cy="50" r="6">
            <animate attributeName="opacity" values="0;1;0" dur="1s" begin="0.75s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </div>
  );
}

export default {};
