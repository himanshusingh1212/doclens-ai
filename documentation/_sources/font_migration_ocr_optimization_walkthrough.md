# Font Migration & OCR Optimization Walkthrough

The application has been updated to use the **Calibri / Arial** font stack as requested, alongside a significant boost to the underlying OCR engine's precision.

## 🎨 UI Typography Update
The Stylistic "Space Grotesk" font has been replaced with a premium, high-compatibility sans-serif stack.

- **Primary Font**: Calibri
- **Fallbacks**: Arial, Inter, system-ui
- **Technical Font**: JetBrains Mono (refined with modern fallbacks like Consolas)

### Visual Verification
![Dashboard Typography](file:///home/sanskar/.gemini/antigravity/brain/77baff6c-1b4c-4bc9-a847-e815681bcdd5/.system_generated/click_feedback/click_feedback_1775765609088.png)
*The dashboard now uses a clean, professional sans-serif typeface.*

---

## 🧠 OCR "Decoding" Improvements
To address the "weird glyphs" issue at the source, the following technical remediations were applied:

### 1. Increased Resolution Scaling
In `pdf-renderer.ts`, the OCR rendering scale was increased from **2.0 → 2.5**. 
> [!TIP]
> This provide Tesseract with **~56% more pixel data**, allowing it to "see" character edges more clearly and reducing the chance of misidentifying a character as a weird glyph.

### 2. Unicode Normalization & Cleaning
Updated the `cleanOcrText` utility to:
- **Normalize Unicode** (Form NFKD) to ensure composite characters are handled consistently.
- **Strip Replacement Characters**: Automatically filters out `\uFFFD` (the "box with a question mark") and other non-printable control characters that often appear as weird glyphs.

---

## 🔍 Note on Existing Documents
> [!IMPORTANT]
> The font change applies immediately to all UI views. However, if you are still seeing weird glyphs in previously processed documents (like decorative titles using custom PUA encoding), you may need to **re-process those pages** to benefit from the new 2.5x scaling and character normalization.
