import { useState } from 'react';
import { uploadStatementApi, confirmStatementImportApi } from '../../api/client';
import { useFixedIncomeStore } from '../../store/fixedIncomeStore';
import toast from 'react-hot-toast';

export default function StatementImporterModal({ isOpen, onClose }) {
  const { entities, fetchFixedIncomeData } = useFixedIncomeStore();
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [password, setPassword] = useState(() => localStorage.getItem('pdf_extract_cedula') || '');
  const [startYear, setStartYear] = useState(2024);
  const [savePasswordLocally, setSavePasswordLocally] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [targetEntityId, setTargetEntityId] = useState('ent_nu');
  const [selectedAccounts, setSelectedAccounts] = useState([]);
  const [selectedCDTs, setSelectedCDTs] = useState([]);
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const handleFilesAdded = (newFileList) => {
    if (!newFileList || newFileList.length === 0) return;
    const fileArray = Array.from(newFileList);
    setFiles((prev) => [...prev, ...fileArray]);
    setExtractedData(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleRemoveFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleProcessFile = async () => {
    if (files.length === 0) {
      toast.error('Por favor selecciona o arrastra al menos un archivo PDF o captura de pantalla');
      return;
    }

    if (savePasswordLocally && password) {
      localStorage.setItem('pdf_extract_cedula', password.trim());
    }

    setIsUploading(true);
    try {
      const res = await uploadStatementApi(files, password.trim(), startYear);
      if (!res.success) {
        if (res.error === 'PDF_ENCRYPTED') {
          toast.error(res.message || 'PDF protegido. Ingresa tu cédula o clave');
        } else if (res.error === 'WRONG_PASSWORD') {
          toast.error('Contraseña incorrecta para el PDF');
        } else {
          toast.error(res.message || 'Error analizando extractos');
        }
        setIsUploading(false);
        return;
      }

      // Ensure parsedData has at least 1 account fallback if OCR text was generic
      if (!res.parsedData) res.parsedData = { accounts: [], cdts: [], movements: [] };
      if (!res.parsedData.accounts) res.parsedData.accounts = [];
      if (!res.parsedData.cdts) res.parsedData.cdts = [];

      if (res.parsedData.accounts.length === 0 && res.parsedData.cdts.length === 0) {
        res.parsedData.accounts = [
          {
            name: "Cuenta Principal / Cajita",
            type: "pocket",
            currency: "COP",
            balance: 0.0,
            interestRateEA: 12.0,
            isTaxExemptGMF: true
          }
        ];
      }

      setExtractedData(res);
      setTargetEntityId(res.bankEntity?.id || (entities.length > 0 ? entities[0].id : 'ent_nu'));
      setSelectedAccounts((res.parsedData.accounts || []).map((_, i) => i));
      setSelectedCDTs((res.parsedData.cdts || []).map((_, i) => i));
      toast.success(`¡${res.processedFilesCount || files.length} archivo(s) analizados exitosamente!`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error subiendo los archivos');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!extractedData) return;

    const accountsToImport = (extractedData.parsedData?.accounts || []).filter((_, i) => selectedAccounts.includes(i));
    const cdtsToImport = (extractedData.parsedData?.cdts || []).filter((_, i) => selectedCDTs.includes(i));

    if (accountsToImport.length === 0 && cdtsToImport.length === 0) {
      toast.error('Selecciona al menos un producto (Cuenta o CDT) para importar');
      return;
    }

    setIsImporting(true);
    try {
      const res = await confirmStatementImportApi(
        targetEntityId,
        accountsToImport,
        cdtsToImport,
        extractedData.parsedData?.movements || []
      );

      toast.success(`¡Importado con éxito! (${res.importedAccounts} Cuentas/Cajitas, ${res.importedCDTs} CDTs)`);
      await fetchFixedIncomeData();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error al importar datos');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1100, padding: '30px 16px', overflowY: 'auto' }}>
      <div className="card fade-up" style={{ width: '100%', maxWidth: 660, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', padding: 24, borderRadius: 16, boxShadow: '0 25px 60px rgba(0,0,0,0.9)', marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12 }}>
          <h3 style={{ margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.15rem' }}>
            📑 Importador Multibanco en Lote (PDFs / Fotos)
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {!extractedData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Multi-file Drag & Drop Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  padding: 24,
                  border: `2px dashed ${isDragOver ? '#38bdf8' : 'rgba(56, 189, 248, 0.35)'}`,
                  borderRadius: 14,
                  background: isDragOver ? 'rgba(56, 189, 248, 0.1)' : 'rgba(56, 189, 248, 0.03)',
                  textAlign: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => handleFilesAdded(e.target.files)}
                  id="multi-pdf-upload-input"
                  style={{ display: 'none' }}
                />
                <label htmlFor="multi-pdf-upload-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '2.8rem' }}>📂</span>
                  <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '1.05rem' }}>
                    Arrastra aquí tus archivos o haz clic para seleccionar en lote
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Admite extractos PDF oficiales y fotos/screenshots del celular (Nu, Lulo, Finandina, Bancolombia, etc.)
                  </span>
                </label>
              </div>

              {/* List of files selected */}
              {files.length > 0 && (
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: 700, marginBottom: 8 }}>
                    📁 Lote de Archivos Seleccionados ({files.length}):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                    {files.map((f, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: 6, fontSize: '0.8rem' }}>
                        <span style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {f.name.endsWith('.pdf') ? '📄' : '📷'} {f.name}
                        </span>
                        <button
                          onClick={() => handleRemoveFile(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700 }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: 6, fontWeight: 600 }}>
                    🔑 Contraseña del PDF / Cédula del Titular (si está protegido)
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ej. Cédula de ciudadanía o NIT"
                    className="input"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: 6, fontWeight: 600 }}>
                    🗓️ Año inicial
                  </label>
                  <input
                    type="number"
                    value={startYear}
                    onChange={(e) => setStartYear(Number(e.target.value))}
                    placeholder="2024"
                    className="input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ marginTop: -6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  id="remember-cedula"
                  checked={savePasswordLocally}
                  onChange={(e) => setSavePasswordLocally(e.target.checked)}
                />
                <label htmlFor="remember-cedula" style={{ fontSize: '0.78rem', color: '#94a3b8', cursor: 'pointer' }}>
                  Recordar esta clave localmente en el navegador para futuros extractos
                </label>
              </div>

              {/* Progress Indicator while analyzing */}
              {isUploading && (
                <div style={{ padding: 14, background: 'rgba(56, 189, 248, 0.08)', borderRadius: 10, border: '1px solid rgba(56, 189, 248, 0.25)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span className="spin">⏳</span> Analizando y extrayendo {files.length} archivo(s)... Por favor espera unos segundos
                  </div>
                  <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, #38bdf8, #818cf8, #38bdf8)', borderRadius: 3, animation: 'pulse 1.2s infinite' }} />
                  </div>
                </div>
              )}

              <button
                onClick={handleProcessFile}
                disabled={isUploading || files.length === 0}
                className="btn-primary"
                style={{ padding: '12px', fontSize: '0.95rem', width: '100%', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {isUploading ? '⏳ Procesando Analizador OCR...' : `🔍 Analizar e Ingestar ${files.length > 0 ? files.length : ''} Archivo(s) en Lote`}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Bank Entity Target Selector */}
              <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#38bdf8', fontWeight: 700, marginBottom: 8 }}>
                  🏦 Entidad Bancaria Destino para Importar:
                </label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: '1.5rem' }}>{extractedData.bankEntity?.icon || '🏦'}</span>
                  <select
                    value={targetEntityId}
                    onChange={(e) => setTargetEntityId(e.target.value)}
                    className="input"
                    style={{ flex: 1, background: '#020617', color: '#f8fafc', fontWeight: 700 }}
                  >
                    <option value="ent_nu">💜 Nu Colombia</option>
                    <option value="ent_finandina">🏦 Banco Finandina</option>
                    <option value="ent_lulo">⚡ Lulo Bank</option>
                    <option value="ent_pibank">🏦 Pibank</option>
                    <option value="ent_rappi">💳 RappiPay (RappiCuenta)</option>
                    <option value="ent_bancolombia">🟡 Bancolombia</option>
                    <option value="ent_davivienda">🔴 Davivienda</option>
                    <option value="ent_uala">🔴 Ualá Colombia</option>
                    <option value="ent_bogota">🏦 Banco de Bogotá</option>
                    <option value="ent_falabella">🟢 Banco Falabella</option>
                    <option value="ent_serfinanza">🏦 Banco Serfinanza</option>
                    <option value="ent_ibkr">💵 Interactive Brokers</option>
                  </select>
                </div>
                <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: 6 }}>
                  Entidad sugerida por análisis de texto: <strong style={{ color: '#e2e8f0' }}>{extractedData.bankEntity?.name || 'Nu Colombia'}</strong> ({extractedData.processedFilesCount || files.length} archivos procesados)
                </div>
              </div>

              {/* Accounts / Cajitas Detected */}
              {extractedData.parsedData?.accounts?.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#38bdf8' }}>
                    💳 Cuentas / Cajitas Extraídas ({extractedData.parsedData.accounts.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {extractedData.parsedData.accounts.map((acc, idx) => (
                      <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <input
                          type="checkbox"
                          checked={selectedAccounts.includes(idx)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedAccounts([...selectedAccounts, idx]);
                            else setSelectedAccounts(selectedAccounts.filter((i) => i !== idx));
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{acc.name}</div>
                          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            Saldo: ${acc.balance?.toLocaleString('es-CO')} COP | Tasa: {acc.interestRateEA}% E.A.
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* CDTs Detected */}
              {extractedData.parsedData?.cdts?.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#10b981' }}>
                    📜 CDTs Extraídos ({extractedData.parsedData.cdts.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {extractedData.parsedData.cdts.map((cdt, idx) => (
                      <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <input
                          type="checkbox"
                          checked={selectedCDTs.includes(idx)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedCDTs([...selectedCDTs, idx]);
                            else setSelectedCDTs(selectedCDTs.filter((i) => i !== idx));
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{cdt.name}</div>
                          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            Capital: ${cdt.capital?.toLocaleString('es-CO')} COP | Tasa: {cdt.interestRateEA}% E.A. | Fecha: {cdt.startDate}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Movements Detected */}
              {extractedData.parsedData?.movements?.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#f59e0b' }}>
                    💸 Movimientos Extraídos ({extractedData.parsedData.movements.length})
                  </h4>
                  <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
                    {extractedData.parsedData.movements.map((m, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
                        <span style={{ color: '#94a3b8' }}>{m.date} - {m.description}</span>
                        <span style={{ fontWeight: 700, color: m.amount >= 0 ? '#22c55e' : '#ef4444' }}>
                          {m.amount >= 0 ? '+' : ''}${m.amount?.toLocaleString('es-CO')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <button onClick={() => { setExtractedData(null); setFiles([]); }} style={{ flex: 1, padding: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, cursor: 'pointer' }}>
                  🔙 Elegir otros archivos
                </button>

                <button onClick={handleConfirmImport} disabled={isImporting} className="btn-primary" style={{ flex: 2, padding: 10, fontSize: '0.95rem' }}>
                  {isImporting ? '⏳ Importando...' : '✅ Confirmar e Ingestar al Portafolio'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
