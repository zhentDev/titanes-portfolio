# Directrices de Desarrollo y Tooling Moderno (Rust-Powered)

Al generar código, comandos o recomendaciones, sigue siempre estas directivas:

## 🐍 Ecosistema Python (Rust Core)
* **Gestor de paquetes y entornos:** Usa exclusivamente **`uv`**.
  * Crear entorno: `uv venv`
  * Ejecutar scripts: `uv run main.py`
  * Instalar paquetes: `uv add <paquete>`
  * Scripts autocontenidos: Usa metadata PEP 723 con `uv run`.
* **Linter y Formateador:** Usa **`ruff`** (`ruff check`, `ruff format`) en lugar de `flake8`, `black` o `isort`.

## ⚡ Ecosistema JavaScript / TypeScript
* **Runtime y Gestor:** Usa exclusivamente **`bun`**.
  * Instalar dependencias: `bun add <paquete>`
  * Ejecutar scripts/servidores: `bun run dev` o `bun index.ts`
  * Testing: `bun test`
  * Ejecutar binarios: `bunx <herramienta>`
* **Linter/Formato:** Prefiere **`biome`** (`bunx @biomejs/biome`) sobre ESLint + Prettier.

## 📊 Manipulación de Datos: Polars vs Pandas
* **Uso prioritario:** Escribe código usando **`polars`** por defecto.
  * Usa `pl.LazyFrame` (`pl.scan_csv`, `pl.scan_parquet`) y `.collect()` para consultas optimizadas.
  * Aprovecha la ejecución multihilo y las expresiones vectorizadas (`pl.col(...)`).
* **Integración con Pandas / ML:**
  * Usa Pandas **solo** en el paso final si una librería de terceros no soporta Arrow/Polars:
    ```python
    import polars as pl

    # Procesamiento ultrarrápido en Polars
    df = (
        pl.scan_parquet("data.parquet")
        .filter(pl.col("ventas") > 1000)
        .group_by("categoria")
        .agg(pl.col("ventas").mean().alias("promedio_ventas"))
        .collect()
    )

    # Conversión cero-copia si necesitas graficar con seaborn / matplotlib
    df_pandas = df.to_pandas()
    ```