import toast from 'react-hot-toast';

export const toastConfirm = (message) => {
  return new Promise((resolve) => {
    toast(
      (t) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f1f5f9' }}>{message}</div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
              style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                resolve(true);
              }}
              style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Confirmar
            </button>
          </div>
        </div>
      ),
      {
        duration: Infinity,
        style: {
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          color: '#fff',
        }
      }
    );
  });
};

export const toastPrompt = (message, defaultValue = '') => {
  return new Promise((resolve) => {
    toast(
      (t) => {
        let inputValue = defaultValue;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f1f5f9', whiteSpace: 'pre-line' }}>{message}</div>
            <input 
              type="text" 
              defaultValue={defaultValue} 
              autoFocus
              onChange={(e) => inputValue = e.target.value}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  toast.dismiss(t.id);
                  setTimeout(() => resolve(inputValue), 200);
                } else if (e.key === 'Escape') {
                  toast.dismiss(t.id);
                  resolve(null);
                }
              }}
              style={{
                padding: '8px', 
                borderRadius: '4px', 
                border: '1px solid var(--border)', 
                background: 'rgba(0,0,0,0.2)', 
                color: '#fff', 
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve(null);
                }}
                style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  setTimeout(() => resolve(inputValue), 200);
                }}
                style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', background: '#00e5ff', color: '#000', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Aceptar
              </button>
            </div>
          </div>
        );
      },
      {
        duration: Infinity,
        style: {
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          color: '#fff',
          minWidth: '300px'
        }
      }
    );
  });
};
