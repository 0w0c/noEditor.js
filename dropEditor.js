class Editor {
    static dom;
    static css;
    static ver = 0;
    static rev = [];
    static box = [];
    static _act = "";
    static _key = "";
    static _rec = {};
    static async pick(e) {
        var picker = document.querySelector('#picker');
        if (!picker) {
            picker = document.createElement('input');
            picker.setAttribute('id', 'picker');
            picker.setAttribute('type', 'file');
            //picker.setAttribute('accept', 'image/*');
            picker.setAttribute('multiple', 'multiple');
            picker.setAttribute('hidden', 'hidden');
            document.body.appendChild(picker);
        }
        picker.click();
        picker.onchange = async c => {
            const files = document.querySelector('#picker').files;
            if (!files.length) { return; }
            await this.pour({ "fileList": (await Promise.all(Array.from(files).map(async f => "\v" + await this.item(f) + "\v"))).join("\n") });
        };
    };
    static async item(f) {
        this.box.push(f);
        const fid = this.box.length;
        const cvs = document.createElement("canvas");
        cvs.width = 150;
        cvs.height = this.css.textHeight;
        const ctx = cvs.getContext("2d");
        ctx.font = this.css.font;
        ctx.fillStyle = "black";
        ctx.textBaseline = "middle";
        let tag = f.name || "#" + fid;
        if (ctx.measureText(tag).width > cvs.width) {
            const max = cvs.width - ctx.measureText("...").width;
            let bsl = 0;
            let bsr = tag.length;
            while (bsl <= bsr) {
                const mid = Math.floor((bsl + bsr) / 2);
                if (ctx.measureText(tag.slice(0, mid)).width > max) { bsr = mid - 1; }
                else { bsl = mid + 1; }
            }
            tag = tag.slice(0, bsr) + "...";
        }
        ctx.fillText(tag, 0, cvs.height / 2);
        return URL.createObjectURL(await new Promise(r => cvs.toBlob(r))) + "#" + fid; // URL.revokeObjectURL
    };
    static async pour(e) {
        "preventDefault" in (e ?? {}) && e.preventDefault();
        (e ??= {}).inputType ??= "insertFromPaste";
        this.prep(e);
        let txt = "";
        if (e.fileList) {
            txt = e.fileList;
        }
        else if (e.dataTransfer?.types.includes("text/html")) {
            const tmp = e.dataTransfer.getData("text");
            txt = new Range().createContextualFragment(e.dataTransfer.getData("text/html")
                .replace(/\v/g, "\n\t")
                .replace(/>[^\S\n]+</g, "> <")
                .replace(/\<img\s+.*?src=\"([^"]+)\".*?\>/gi, "\v$1\v")
                .replace(/(\<(?:option|td|th)(?:\>|\s+.*?\>))/gi, " $1")
                .replace(/(\<(?:address|article|aside|blockquote|br|caption|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h\d|header|hr|iframe|legend|li|main|nav|ol|p|pre|ruby|section|summary|table|tbody|tfoot|thead|tr|ul)(?:\>|\s+.*?\>))/gi, "\n$1")
            ).textContent
                .replace(/(\vblob:[^#]+?\v)(?=\vblob:)/gi, "$1\n")
                .replace(/^[^\S\v]+/, tmp.match(/^[^\S\n]*(\n*)/)[1])
                .replace(/[^\S\v]+$/, tmp.match(/(\n*)[^\S\n]*$/)[1])
            await Promise.all(
                Array.from(new Set(txt.match(/\v(?:blob|data):[^#]+?\v/gi) || [])).map(async m => {
                    const u = m.slice(1, m.length - 1);
                    const i = await fetch(u).then(r => r.blob()).then(b => new File([b], "")).then(f => this.item(f));
                    txt = txt.replaceAll(u, i);
                    if (u.startsWith("blob:")) { URL.revokeObjectURL(u); }
                })
            );
        }
        else if (e.dataTransfer?.types.includes("text/plain")) {
            txt = e.dataTransfer.getData("text/plain");
        }
        else if (e.dataTransfer?.types.includes("Files")) {
            txt = (await Promise.all(
                Array.from(e.dataTransfer.items || []) //stackoverflow.com/questions/3590058
                    .flatMap(i => (i.webkitGetAsEntry()?.isFile === false) ? [] : (i.getAsFile() || []))
                    .sort((a, b) => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare(a.name, b.name))
                    .map(async f => "\v" + await this.item(f) + "\v"))
            ).join("\n")
        }
        const doc = new DocumentFragment();
        doc.replaceChildren(new Range().createContextualFragment(await txt
            .replace(/[\u00A0-\u9999<>\&\'\"\\]/gi, _ => "&#" + _.charCodeAt(0) + ";")
            .replace(/\v(blob:.*?(#.*?))\v/gi, "<img class=\"_editor_file_wait\" src=\"$1\" alt=\"\" />")
            .replace(/\v(.*?)\v/gi, "<img src=\"$1\" alt=\"\" />")
            .replace(/\r\n|\r/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
        ));
        const l = doc.lastChild;
        const r = this.range(e);
        r.rg.deleteContents();
        r.rg.insertNode(doc);
        if (l) { r.rg.setStartAfter(l); }
        this.slide(r.rg);
        r.sl.removeAllRanges();
        r.sl.addRange(r.rg);
        this.done(e);
    };
    static dump(e) {
        const use = this.rev[this.ver - 1];
        if (!use) { return; }
        this.dom.replaceChildren(use.dom.cloneNode(true));
        const r = this.range(e);
        if (use.startIndex < 0) {
            if (use.startOffset >= this.dom.childNodes.length) {
                r.rg.setStartAfter(this.dom.lastChild);
            } else {
                r.rg.setStartBefore(this.dom.childNodes[use.startOffset]);
            }
        } else {
            r.rg.setStart(this.dom.childNodes[use.startIndex], use.startOffset);
        }
        if (use.endIndex < 0) {
            if (use.endOffset >= this.dom.childNodes.length) {
                r.rg.setEndAfter(this.dom.lastChild);
            } else {
                r.rg.setEndBefore(this.dom.childNodes[use.endOffset]);
            }
        } else {
            r.rg.setEnd(this.dom.childNodes[use.endIndex], use.endOffset);
        }
        this.slide(r.rg);
        r.sl.removeAllRanges();
        r.sl.addRange(r.rg);
    };
    static undo(e) {
        "preventDefault" in (e ?? {}) && e.preventDefault();
        (e ??= {}).inputType ??= "historyUndo";
        this.prep(e);
        if (this.ver < 2) { return; }
        this.ver--;
        this.dump(e);
        this.done(e);
    };
    static redo(e) {
        "preventDefault" in (e ?? {}) && e.preventDefault();
        (e ??= {}).inputType ??= "historyRedo";
        this.prep(e);
        if (this.ver === this.rev.length) { return; }
        this.ver++;
        this.dump(e);
        this.done(e);
    };
    static nlbr(e) {
        "preventDefault" in (e ?? {}) && e.preventDefault();
        (e ??= {}).inputType ??= "insertLineBreak";
        this.prep(e);
        const r = this.range(e);
        r.rg.deleteContents();
        r.rg.insertNode(new Text("\n"));
        r.rg.collapse(false);
        this.slide(r.rg);
        r.sl.removeAllRanges();
        r.sl.addRange(r.rg);
        this.done(e);
    };
    static prep(e) {
        this.dom.focus();
        if (!["!", "insertCompositionText", "insertFromComposition", "deleteCompositionText"].includes(this._act)) {
            if (!this._act.startsWith("history")) {
                const child = Array.from(this.dom.childNodes);
                const rgNow = this.range(e).rg;
                const rgAll = new Range();
                rgAll.selectNodeContents(this.dom);
                this.rev.push({
                    startIndex: child.indexOf(rgNow.startContainer),
                    startOffset: rgNow.startOffset,
                    endIndex: child.indexOf(rgNow.endContainer),
                    endOffset: rgNow.endOffset,
                    dom: child.length ? rgAll.cloneContents() : rgAll.createContextualFragment("\n")
                });
                this.ver = this.rev.length;
            }
            else if (e?.inputType && !e.inputType.startsWith("history")) {
                this.rev.splice(this.ver);
            }
        }
        this._act = e?.inputType || "";
    };
    static done(e) {
        if (this.dom.textContent.slice(-1) !== "\n") { this.dom.appendChild(new Text("\n")); }
    };
    static range(e) {
        const sl = document.getSelection();
        if (e?.clientX && e?.clientY) {
            if (document.caretPositionFromPoint) { return { sl, rg: document.caretPositionFromPoint(e.clientX, e.clientY) } }
            if (document.caretRangeFromPoint) { return { sl, rg: document.caretRangeFromPoint(e.clientX, e.clientY) } }
        }
        return { sl, rg: sl.rangeCount ? sl.getRangeAt(0) : new Range() }
    };
    static slide(r) {
        const n = new Text("\u200B");
        r = r.cloneRange();
        r.insertNode(n);
        const d = r.getBoundingClientRect().bottom - (this.dom.getBoundingClientRect().top + this.dom.clientTop + this.dom.clientHeight - parseInt(this.css.paddingBottom));
        n.remove();
        if (d > 0) { this.dom.scrollTop += d; }
    };
    static watch(s) {
        this.dom = document.querySelector(s);
        this.dom.addEventListener('keydown', async e => {
            e.stopImmediatePropagation();
            const rg = this.range(e).rg;
            if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.code === "KeyZ") || e.code === "KeyY")) { this.redo(e); }
            else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { this.undo(e); }
            else if (rg.startContainer === rg.endContainer && rg.startOffset === rg.endOffset && (
                ((this._act === "insertText") && (
                    [this._key, e.code].every(k => k === "Space") ||
                    [this._key, e.code].every(k => ["Key", "Digit", "Numpad"].some(w => k.startsWith(w)) && k !== "NumpadEnter")
                )) ||
                (["insertLineBreak", "insertParagraph"].includes(this._act) &&
                    [this._key, e.code].every(k => ["Enter", "NumpadEnter"].includes(k))
                ) ||
                (["deleteContentBackward", "deleteContentForward"].includes(this._act) &&
                    [this._key, e.code].every(k => ["Backspace", "Delete"].includes(k)) && !(
                        (e.code === "Backspace" && (
                            (rg.startContainer === this.dom &&
                                this.dom.childNodes[rg.startOffset - 1]?.nodeName !== "#text"
                            ) ||
                            (rg.startContainer.nodeName === "#text" && (
                                (rg.startOffset > 0 && rg.startContainer.textContent[rg.startOffset - 1] === "\n") ||
                                (rg.startOffset === 0 && (
                                    rg.startContainer.previousSibling?.nodeName !== "#text" ||
                                    rg.startContainer.previousSibling?.textContent?.endsWith("\n")
                                ))
                            ))
                        ) && (this._rec["save"] = true)) ||
                        (e.code === "Delete" && (
                            (rg.endContainer === this.dom && (
                                this.dom.childNodes[rg.endOffset]?.nodeName !== "#text" ||
                                this.dom.childNodes[rg.endOffset]?.textContent.slice(0, 1) === "\n"
                            )) ||
                            (rg.endContainer.nodeName === "#text" && (
                                (rg.endOffset < rg.endContainer.length && rg.endContainer.textContent[rg.endOffset] === "\n") ||
                                (rg.endOffset === rg.endContainer.length && (
                                    rg.endContainer.nextSibling?.nodeName !== "#text" ||
                                    rg.endContainer.nextSibling?.textContent.startsWith("\n")
                                ))
                            ))
                        ) && (this._rec["save"] = true)) ||
                        (this._rec["save"] && delete this._rec["save"])
                    )
                )
            )) { this._act = "!"; }
            this._key = e.code;
        }, false);
        this.dom.addEventListener("beforeinput", async e => {
            if (e.inputType.startsWith("format") || (!e.inputType.startsWith("delete") && ![
                "historyUndo", "historyRedo",
                "insertLineBreak", "insertParagraph",
                "insertText", "insertCompositionText", "insertFromComposition",
                "insertFromDrop", "insertFromYank", "insertFromPaste", "insertFromPasteAsQuotation", "insertReplacementText",
            ].includes(e.inputType))) { e.preventDefault(); return; }
            if ([
                "insertFromDrop", "insertFromYank", "insertFromPaste", "insertFromPasteAsQuotation", "insertReplacementText"
            ].includes(e.inputType)) { await this.pour(e); }
            else if (["insertLineBreak", "insertParagraph"].includes(e.inputType)) { this.nlbr(e); }
            else if (e.inputType === "historyUndo") { this.undo(e); }
            else if (e.inputType === "historyRedo") { this.redo(e); }
            else {
                const rg = this.range(e).rg;
                if (this._act != "!" &&
                    (e.inputType === "deleteContentBackward" && (
                        (rg.startContainer === this.dom && ["", "\n"].includes(this.dom.innerHTML)) ||
                        (rg.startContainer === this.dom.firstChild && rg.startContainer.textContent === "\n") ||
                        (rg.startOffset === 0 && !rg.startContainer.previousSibling)
                    )) ||
                    (e.inputType === "deleteContentForward" && (
                        (rg.endContainer === this.dom && ["", "\n"].includes(this.dom.innerHTML)) ||
                        (rg.endContainer === this.dom.lastChild && (
                            rg.endContainer.textContent === "\n" ||
                            (rg.endOffset === rg.endContainer.length - 1 && rg.endContainer.textContent.slice(-1) === "\n")
                        )) ||
                        (rg.endOffset === rg.endContainer.length && (
                            !rg.endContainer.nextSibling ||
                            (rg.endContainer.nextSibling === this.dom.lastChild && rg.endContainer.nextSibling.textContent === "\n")
                        ))
                    ))
                ) { this._act = "!"; }
                this.prep(e);
            }
        }, false);
        this.dom.addEventListener("input", async e => {
            this.done(e);
        }, false);
        this.dom.addEventListener('compositionend', async e => {
            e.inputType = "insertCompositionEnd";
            this.prep(e);
            this.done(e);
        }, false);
        this.dom.addEventListener('drop', async e => {
            if (e.dataTransfer?.types?.length === 1 && e.dataTransfer.types[0] === "Files") {
                e.inputType = "insertFromDrop";
                this._key = "Drop";
                await this.pour(e);
            }
        }, false);
        ['dragenter', 'dragover', 'drop'].forEach(_ => {
            window.addEventListener(_, async e => e.preventDefault(), false);
            this.dom.addEventListener(_, async e => e.stopPropagation(), false);
        });
        this.dom.setAttribute("translate", "no");
        this.dom.setAttribute("spellcheck", "false");
        this.css = window.getComputedStyle(this.dom);
        const rct = document.createElement("span");
        rct.innerText = "\u200B";
        this.dom.appendChild(rct);
        this.css.textHeight = rct.getClientRects()[0].height;
        this.dom.removeChild(rct);
        this.done(window.event);
    };
    static sweep() {
        this.ver = 0;
        this.rev = [];
        this._act = "";
        this._key = "";
        this._rec = {};
    };
};