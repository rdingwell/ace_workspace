"no use strict";
;(function(window) {
if (typeof window.window != "undefined" && window.document) {
    return;
}

window.console = function() {
    var msgs = Array.prototype.slice.call(arguments, 0);
    postMessage({type: "log", data: msgs});
};
window.console.error =
window.console.warn = 
window.console.log =
window.console.trace = window.console;

window.window = window;
window.ace = window;

window.onerror = function(message, file, line, col, err) {
    postMessage({type: "error", data: {
        message: message,
        file: file,
        line: line, 
        col: col,
        stack: err.stack
    }});
};

window.normalizeModule = function(parentId, moduleName) {
    // normalize plugin requires
    if (moduleName.indexOf("!") !== -1) {
        var chunks = moduleName.split("!");
        return window.normalizeModule(parentId, chunks[0]) + "!" + window.normalizeModule(parentId, chunks[1]);
    }
    // normalize relative requires
    if (moduleName.charAt(0) == ".") {
        var base = parentId.split("/").slice(0, -1).join("/");
        moduleName = (base ? base + "/" : "") + moduleName;
        
        while(moduleName.indexOf(".") !== -1 && previous != moduleName) {
            var previous = moduleName;
            moduleName = moduleName.replace(/^\.\//, "").replace(/\/\.\//, "/").replace(/[^\/]+\/\.\.\//, "");
        }
    }
    
    return moduleName;
};

window.require = function(parentId, id) {
    if (!id) {
        id = parentId;
        parentId = null;
    }
    if (!id.charAt)
        throw new Error("worker.js require() accepts only (parentId, id) as arguments");

    id = window.normalizeModule(parentId, id);

    var module = window.require.modules[id];
    if (module) {
        if (!module.initialized) {
            module.initialized = true;
            module.exports = module.factory().exports;
        }
        return module.exports;
    }
    
    var chunks = id.split("/");
    if (!window.require.tlns)
        return console.log("unable to load " + id);
    chunks[0] = window.require.tlns[chunks[0]] || chunks[0];
    var path = chunks.join("/") + ".js";
    
    window.require.id = id;
    importScripts(path);
    return window.require(parentId, id);
};
window.require.modules = {};
window.require.tlns = {};

window.define = function(id, deps, factory) {
    if (arguments.length == 2) {
        factory = deps;
        if (typeof id != "string") {
            deps = id;
            id = window.require.id;
        }
    } else if (arguments.length == 1) {
        factory = id;
        deps = [];
        id = window.require.id;
    }
    
    if (typeof factory != "function") {
        window.require.modules[id] = {
            exports: factory,
            initialized: true
        };
        return;
    }

    if (!deps.length)
        // If there is no dependencies, we inject 'require', 'exports' and
        // 'module' as dependencies, to provide CommonJS compatibility.
        deps = ['require', 'exports', 'module'];

    var req = function(childId) {
        return window.require(id, childId);
    };

    window.require.modules[id] = {
        exports: {},
        factory: function() {
            var module = this;
            var returnExports = factory.apply(this, deps.map(function(dep) {
              switch(dep) {
                  // Because 'require', 'exports' and 'module' aren't actual
                  // dependencies, we must handle them seperately.
                  case 'require': return req;
                  case 'exports': return module.exports;
                  case 'module':  return module;
                  // But for all other dependencies, we can just go ahead and
                  // require them.
                  default:        return req(dep);
              }
            }));
            if (returnExports)
                module.exports = returnExports;
            return module;
        }
    };
};
window.define.amd = {};

window.initBaseUrls  = function initBaseUrls(topLevelNamespaces) {
    require.tlns = topLevelNamespaces;
};

window.initSender = function initSender() {

    var EventEmitter = window.require("ace/lib/event_emitter").EventEmitter;
    var oop = window.require("ace/lib/oop");
    
    var Sender = function() {};
    
    (function() {
        
        oop.implement(this, EventEmitter);
                
        this.callback = function(data, callbackId) {
            postMessage({
                type: "call",
                id: callbackId,
                data: data
            });
        };
    
        this.emit = function(name, data) {
            postMessage({
                type: "event",
                name: name,
                data: data
            });
        };
        
    }).call(Sender.prototype);
    
    return new Sender();
};

var main = window.main = null;
var sender = window.sender = null;

window.onmessage = function(e) {
    var msg = e.data;
    if (msg.command) {
        if (main[msg.command])
            main[msg.command].apply(main, msg.args);
        else
            throw new Error("Unknown command:" + msg.command);
    }
    else if (msg.init) {        
        initBaseUrls(msg.tlns);
        require("ace/lib/es5-shim");
        sender = window.sender = initSender();
        var clazz = require(msg.module)[msg.classname];
        main = window.main = new clazz(sender);
    } 
    else if (msg.event && sender) {
        sender._signal(msg.event, msg.data);
    }
};
})(this);

define("ace/lib/oop",["require","exports","module"], function(require, exports, module) {
"use strict";

exports.inherits = function(ctor, superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
            value: ctor,
            enumerable: false,
            writable: true,
            configurable: true
        }
    });
};

exports.mixin = function(obj, mixin) {
    for (var key in mixin) {
        obj[key] = mixin[key];
    }
    return obj;
};

exports.implement = function(proto, mixin) {
    exports.mixin(proto, mixin);
};

});

define("ace/lib/event_emitter",["require","exports","module"], function(require, exports, module) {
"use strict";

var EventEmitter = {};
var stopPropagation = function() { this.propagationStopped = true; };
var preventDefault = function() { this.defaultPrevented = true; };

EventEmitter._emit =
EventEmitter._dispatchEvent = function(eventName, e) {
    this._eventRegistry || (this._eventRegistry = {});
    this._defaultHandlers || (this._defaultHandlers = {});

    var listeners = this._eventRegistry[eventName] || [];
    var defaultHandler = this._defaultHandlers[eventName];
    if (!listeners.length && !defaultHandler)
        return;

    if (typeof e != "object" || !e)
        e = {};

    if (!e.type)
        e.type = eventName;
    if (!e.stopPropagation)
        e.stopPropagation = stopPropagation;
    if (!e.preventDefault)
        e.preventDefault = preventDefault;

    listeners = listeners.slice();
    for (var i=0; i<listeners.length; i++) {
        listeners[i](e, this);
        if (e.propagationStopped)
            break;
    }
    
    if (defaultHandler && !e.defaultPrevented)
        return defaultHandler(e, this);
};


EventEmitter._signal = function(eventName, e) {
    var listeners = (this._eventRegistry || {})[eventName];
    if (!listeners)
        return;
    listeners = listeners.slice();
    for (var i=0; i<listeners.length; i++)
        listeners[i](e, this);
};

EventEmitter.once = function(eventName, callback) {
    var _self = this;
    callback && this.addEventListener(eventName, function newCallback() {
        _self.removeEventListener(eventName, newCallback);
        callback.apply(null, arguments);
    });
};


EventEmitter.setDefaultHandler = function(eventName, callback) {
    var handlers = this._defaultHandlers
    if (!handlers)
        handlers = this._defaultHandlers = {_disabled_: {}};
    
    if (handlers[eventName]) {
        var old = handlers[eventName];
        var disabled = handlers._disabled_[eventName];
        if (!disabled)
            handlers._disabled_[eventName] = disabled = [];
        disabled.push(old);
        var i = disabled.indexOf(callback);
        if (i != -1) 
            disabled.splice(i, 1);
    }
    handlers[eventName] = callback;
};
EventEmitter.removeDefaultHandler = function(eventName, callback) {
    var handlers = this._defaultHandlers
    if (!handlers)
        return;
    var disabled = handlers._disabled_[eventName];
    
    if (handlers[eventName] == callback) {
        var old = handlers[eventName];
        if (disabled)
            this.setDefaultHandler(eventName, disabled.pop());
    } else if (disabled) {
        var i = disabled.indexOf(callback);
        if (i != -1)
            disabled.splice(i, 1);
    }
};

EventEmitter.on =
EventEmitter.addEventListener = function(eventName, callback, capturing) {
    this._eventRegistry = this._eventRegistry || {};

    var listeners = this._eventRegistry[eventName];
    if (!listeners)
        listeners = this._eventRegistry[eventName] = [];

    if (listeners.indexOf(callback) == -1)
        listeners[capturing ? "unshift" : "push"](callback);
    return callback;
};

EventEmitter.off =
EventEmitter.removeListener =
EventEmitter.removeEventListener = function(eventName, callback) {
    this._eventRegistry = this._eventRegistry || {};

    var listeners = this._eventRegistry[eventName];
    if (!listeners)
        return;

    var index = listeners.indexOf(callback);
    if (index !== -1)
        listeners.splice(index, 1);
};

EventEmitter.removeAllListeners = function(eventName) {
    if (this._eventRegistry) this._eventRegistry[eventName] = [];
};

exports.EventEmitter = EventEmitter;

});

define("ace/range",["require","exports","module"], function(require, exports, module) {
"use strict";
var comparePoints = function(p1, p2) {
    return p1.row - p2.row || p1.column - p2.column;
};
var Range = function(startRow, startColumn, endRow, endColumn) {
    this.start = {
        row: startRow,
        column: startColumn
    };

    this.end = {
        row: endRow,
        column: endColumn
    };
};

(function() {
    this.isEqual = function(range) {
        return this.start.row === range.start.row &&
            this.end.row === range.end.row &&
            this.start.column === range.start.column &&
            this.end.column === range.end.column;
    };
    this.toString = function() {
        return ("Range: [" + this.start.row + "/" + this.start.column +
            "] -> [" + this.end.row + "/" + this.end.column + "]");
    };

    this.contains = function(row, column) {
        return this.compare(row, column) == 0;
    };
    this.compareRange = function(range) {
        var cmp,
            end = range.end,
            start = range.start;

        cmp = this.compare(end.row, end.column);
        if (cmp == 1) {
            cmp = this.compare(start.row, start.column);
            if (cmp == 1) {
                return 2;
            } else if (cmp == 0) {
                return 1;
            } else {
                return 0;
            }
        } else if (cmp == -1) {
            return -2;
        } else {
            cmp = this.compare(start.row, start.column);
            if (cmp == -1) {
                return -1;
            } else if (cmp == 1) {
                return 42;
            } else {
                return 0;
            }
        }
    };
    this.comparePoint = function(p) {
        return this.compare(p.row, p.column);
    };
    this.containsRange = function(range) {
        return this.comparePoint(range.start) == 0 && this.comparePoint(range.end) == 0;
    };
    this.intersects = function(range) {
        var cmp = this.compareRange(range);
        return (cmp == -1 || cmp == 0 || cmp == 1);
    };
    this.isEnd = function(row, column) {
        return this.end.row == row && this.end.column == column;
    };
    this.isStart = function(row, column) {
        return this.start.row == row && this.start.column == column;
    };
    this.setStart = function(row, column) {
        if (typeof row == "object") {
            this.start.column = row.column;
            this.start.row = row.row;
        } else {
            this.start.row = row;
            this.start.column = column;
        }
    };
    this.setEnd = function(row, column) {
        if (typeof row == "object") {
            this.end.column = row.column;
            this.end.row = row.row;
        } else {
            this.end.row = row;
            this.end.column = column;
        }
    };
    this.inside = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isEnd(row, column) || this.isStart(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.insideStart = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isEnd(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.insideEnd = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isStart(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.compare = function(row, column) {
        if (!this.isMultiLine()) {
            if (row === this.start.row) {
                return column < this.start.column ? -1 : (column > this.end.column ? 1 : 0);
            };
        }

        if (row < this.start.row)
            return -1;

        if (row > this.end.row)
            return 1;

        if (this.start.row === row)
            return column >= this.start.column ? 0 : -1;

        if (this.end.row === row)
            return column <= this.end.column ? 0 : 1;

        return 0;
    };
    this.compareStart = function(row, column) {
        if (this.start.row == row && this.start.column == column) {
            return -1;
        } else {
            return this.compare(row, column);
        }
    };
    this.compareEnd = function(row, column) {
        if (this.end.row == row && this.end.column == column) {
            return 1;
        } else {
            return this.compare(row, column);
        }
    };
    this.compareInside = function(row, column) {
        if (this.end.row == row && this.end.column == column) {
            return 1;
        } else if (this.start.row == row && this.start.column == column) {
            return -1;
        } else {
            return this.compare(row, column);
        }
    };
    this.clipRows = function(firstRow, lastRow) {
        if (this.end.row > lastRow)
            var end = {row: lastRow + 1, column: 0};
        else if (this.end.row < firstRow)
            var end = {row: firstRow, column: 0};

        if (this.start.row > lastRow)
            var start = {row: lastRow + 1, column: 0};
        else if (this.start.row < firstRow)
            var start = {row: firstRow, column: 0};

        return Range.fromPoints(start || this.start, end || this.end);
    };
    this.extend = function(row, column) {
        var cmp = this.compare(row, column);

        if (cmp == 0)
            return this;
        else if (cmp == -1)
            var start = {row: row, column: column};
        else
            var end = {row: row, column: column};

        return Range.fromPoints(start || this.start, end || this.end);
    };

    this.isEmpty = function() {
        return (this.start.row === this.end.row && this.start.column === this.end.column);
    };
    this.isMultiLine = function() {
        return (this.start.row !== this.end.row);
    };
    this.clone = function() {
        return Range.fromPoints(this.start, this.end);
    };
    this.collapseRows = function() {
        if (this.end.column == 0)
            return new Range(this.start.row, 0, Math.max(this.start.row, this.end.row-1), 0)
        else
            return new Range(this.start.row, 0, this.end.row, 0)
    };
    this.toScreenRange = function(session) {
        var screenPosStart = session.documentToScreenPosition(this.start);
        var screenPosEnd = session.documentToScreenPosition(this.end);

        return new Range(
            screenPosStart.row, screenPosStart.column,
            screenPosEnd.row, screenPosEnd.column
        );
    };
    this.moveBy = function(row, column) {
        this.start.row += row;
        this.start.column += column;
        this.end.row += row;
        this.end.column += column;
    };

}).call(Range.prototype);
Range.fromPoints = function(start, end) {
    return new Range(start.row, start.column, end.row, end.column);
};
Range.comparePoints = comparePoints;

Range.comparePoints = function(p1, p2) {
    return p1.row - p2.row || p1.column - p2.column;
};


exports.Range = Range;
});

define("ace/anchor",["require","exports","module","ace/lib/oop","ace/lib/event_emitter"], function(require, exports, module) {
"use strict";

var oop = require("./lib/oop");
var EventEmitter = require("./lib/event_emitter").EventEmitter;

var Anchor = exports.Anchor = function(doc, row, column) {
    this.$onChange = this.onChange.bind(this);
    this.attach(doc);
    
    if (typeof column == "undefined")
        this.setPosition(row.row, row.column);
    else
        this.setPosition(row, column);
};

(function() {

    oop.implement(this, EventEmitter);
    this.getPosition = function() {
        return this.$clipPositionToDocument(this.row, this.column);
    };
    this.getDocument = function() {
        return this.document;
    };
    this.$insertRight = false;
    this.onChange = function(e) {
        var delta = e.data;
        var range = delta.range;

        if (range.start.row == range.end.row && range.start.row != this.row)
            return;

        if (range.start.row > this.row)
            return;

        if (range.start.row == this.row && range.start.column > this.column)
            return;

        var row = this.row;
        var column = this.column;
        var start = range.start;
        var end = range.end;

        if (delta.action === "insertText") {
            if (start.row === row && start.column <= column) {
                if (start.column === column && this.$insertRight) {
                } else if (start.row === end.row) {
                    column += end.column - start.column;
                } else {
                    column -= start.column;
                    row += end.row - start.row;
                }
            } else if (start.row !== end.row && start.row < row) {
                row += end.row - start.row;
            }
        } else if (delta.action === "insertLines") {
            if (start.row === row && column === 0 && this.$insertRight) {
            }
            else if (start.row <= row) {
                row += end.row - start.row;
            }
        } else if (delta.action === "removeText") {
            if (start.row === row && start.column < column) {
                if (end.column >= column)
                    column = start.column;
                else
                    column = Math.max(0, column - (end.column - start.column));

            } else if (start.row !== end.row && start.row < row) {
                if (end.row === row)
                    column = Math.max(0, column - end.column) + start.column;
                row -= (end.row - start.row);
            } else if (end.row === row) {
                row -= end.row - start.row;
                column = Math.max(0, column - end.column) + start.column;
            }
        } else if (delta.action == "removeLines") {
            if (start.row <= row) {
                if (end.row <= row)
                    row -= end.row - start.row;
                else {
                    row = start.row;
                    column = 0;
                }
            }
        }

        this.setPosition(row, column, true);
    };
    this.setPosition = function(row, column, noClip) {
        var pos;
        if (noClip) {
            pos = {
                row: row,
                column: column
            };
        } else {
            pos = this.$clipPositionToDocument(row, column);
        }

        if (this.row == pos.row && this.column == pos.column)
            return;

        var old = {
            row: this.row,
            column: this.column
        };

        this.row = pos.row;
        this.column = pos.column;
        this._signal("change", {
            old: old,
            value: pos
        });
    };
    this.detach = function() {
        this.document.removeEventListener("change", this.$onChange);
    };
    this.attach = function(doc) {
        this.document = doc || this.document;
        this.document.on("change", this.$onChange);
    };
    this.$clipPositionToDocument = function(row, column) {
        var pos = {};

        if (row >= this.document.getLength()) {
            pos.row = Math.max(0, this.document.getLength() - 1);
            pos.column = this.document.getLine(pos.row).length;
        }
        else if (row < 0) {
            pos.row = 0;
            pos.column = 0;
        }
        else {
            pos.row = row;
            pos.column = Math.min(this.document.getLine(pos.row).length, Math.max(0, column));
        }

        if (column < 0)
            pos.column = 0;

        return pos;
    };

}).call(Anchor.prototype);

});

define("ace/document",["require","exports","module","ace/lib/oop","ace/lib/event_emitter","ace/range","ace/anchor"], function(require, exports, module) {
"use strict";

var oop = require("./lib/oop");
var EventEmitter = require("./lib/event_emitter").EventEmitter;
var Range = require("./range").Range;
var Anchor = require("./anchor").Anchor;

var Document = function(text) {
    this.$lines = [];
    if (text.length === 0) {
        this.$lines = [""];
    } else if (Array.isArray(text)) {
        this._insertLines(0, text);
    } else {
        this.insert({row: 0, column:0}, text);
    }
};

(function() {

    oop.implement(this, EventEmitter);
    this.setValue = function(text) {
        var len = this.getLength();
        this.remove(new Range(0, 0, len, this.getLine(len-1).length));
        this.insert({row: 0, column:0}, text);
    };
    this.getValue = function() {
        return this.getAllLines().join(this.getNewLineCharacter());
    };
    this.createAnchor = function(row, column) {
        return new Anchor(this, row, column);
    };
    if ("aaa".split(/a/).length === 0)
        this.$split = function(text) {
            return text.replace(/\r\n|\r/g, "\n").split("\n");
        };
    else
        this.$split = function(text) {
            return text.split(/\r\n|\r|\n/);
        };


    this.$detectNewLine = function(text) {
        var match = text.match(/^.*?(\r\n|\r|\n)/m);
        this.$autoNewLine = match ? match[1] : "\n";
        this._signal("changeNewLineMode");
    };
    this.getNewLineCharacter = function() {
        switch (this.$newLineMode) {
          case "windows":
            return "\r\n";
          case "unix":
            return "\n";
          default:
            return this.$autoNewLine || "\n";
        }
    };

    this.$autoNewLine = "";
    this.$newLineMode = "auto";
    this.setNewLineMode = function(newLineMode) {
        if (this.$newLineMode === newLineMode)
            return;

        this.$newLineMode = newLineMode;
        this._signal("changeNewLineMode");
    };
    this.getNewLineMode = function() {
        return this.$newLineMode;
    };
    this.isNewLine = function(text) {
        return (text == "\r\n" || text == "\r" || text == "\n");
    };
    this.getLine = function(row) {
        return this.$lines[row] || "";
    };
    this.getLines = function(firstRow, lastRow) {
        return this.$lines.slice(firstRow, lastRow + 1);
    };
    this.getAllLines = function() {
        return this.getLines(0, this.getLength());
    };
    this.getLength = function() {
        return this.$lines.length;
    };
    this.getTextRange = function(range) {
        if (range.start.row == range.end.row) {
            return this.getLine(range.start.row)
                .substring(range.start.column, range.end.column);
        }
        var lines = this.getLines(range.start.row, range.end.row);
        lines[0] = (lines[0] || "").substring(range.start.column);
        var l = lines.length - 1;
        if (range.end.row - range.start.row == l)
            lines[l] = lines[l].substring(0, range.end.column);
        return lines.join(this.getNewLineCharacter());
    };

    this.$clipPosition = function(position) {
        var length = this.getLength();
        if (position.row >= length) {
            position.row = Math.max(0, length - 1);
            position.column = this.getLine(length-1).length;
        } else if (position.row < 0)
            position.row = 0;
        return position;
    };
    this.insert = function(position, text) {
        if (!text || text.length === 0)
            return position;

        position = this.$clipPosition(position);
        if (this.getLength() <= 1)
            this.$detectNewLine(text);

        var lines = this.$split(text);
        var firstLine = lines.splice(0, 1)[0];
        var lastLine = lines.length == 0 ? null : lines.splice(lines.length - 1, 1)[0];

        position = this.insertInLine(position, firstLine);
        if (lastLine !== null) {
            position = this.insertNewLine(position); // terminate first line
            position = this._insertLines(position.row, lines);
            position = this.insertInLine(position, lastLine || "");
        }
        return position;
    };
    this.insertLines = function(row, lines) {
        if (row >= this.getLength())
            return this.insert({row: row, column: 0}, "\n" + lines.join("\n"));
        return this._insertLines(Math.max(row, 0), lines);
    };
    this._insertLines = function(row, lines) {
        if (lines.length == 0)
            return {row: row, column: 0};
        while (lines.length > 20000) {
            var end = this._insertLines(row, lines.slice(0, 20000));
            lines = lines.slice(20000);
            row = end.row;
        }

        var args = [row, 0];
        args.push.apply(args, lines);
        this.$lines.splice.apply(this.$lines, args);

        var range = new Range(row, 0, row + lines.length, 0);
        var delta = {
            action: "insertLines",
            range: range,
            lines: lines
        };
        this._signal("change", { data: delta });
        return range.end;
    };
    this.insertNewLine = function(position) {
        position = this.$clipPosition(position);
        var line = this.$lines[position.row] || "";

        this.$lines[position.row] = line.substring(0, position.column);
        this.$lines.splice(position.row + 1, 0, line.substring(position.column, line.length));

        var end = {
            row : position.row + 1,
            column : 0
        };

        var delta = {
            action: "insertText",
            range: Range.fromPoints(position, end),
            text: this.getNewLineCharacter()
        };
        this._signal("change", { data: delta });

        return end;
    };
    this.insertInLine = function(position, text) {
        if (text.length == 0)
            return position;

        var line = this.$lines[position.row] || "";

        this.$lines[position.row] = line.substring(0, position.column) + text
                + line.substring(position.column);

        var end = {
            row : position.row,
            column : position.column + text.length
        };

        var delta = {
            action: "insertText",
            range: Range.fromPoints(position, end),
            text: text
        };
        this._signal("change", { data: delta });

        return end;
    };
    this.remove = function(range) {
        if (!(range instanceof Range))
            range = Range.fromPoints(range.start, range.end);
        range.start = this.$clipPosition(range.start);
        range.end = this.$clipPosition(range.end);

        if (range.isEmpty())
            return range.start;

        var firstRow = range.start.row;
        var lastRow = range.end.row;

        if (range.isMultiLine()) {
            var firstFullRow = range.start.column == 0 ? firstRow : firstRow + 1;
            var lastFullRow = lastRow - 1;

            if (range.end.column > 0)
                this.removeInLine(lastRow, 0, range.end.column);

            if (lastFullRow >= firstFullRow)
                this._removeLines(firstFullRow, lastFullRow);

            if (firstFullRow != firstRow) {
                this.removeInLine(firstRow, range.start.column, this.getLine(firstRow).length);
                this.removeNewLine(range.start.row);
            }
        }
        else {
            this.removeInLine(firstRow, range.start.column, range.end.column);
        }
        return range.start;
    };
    this.removeInLine = function(row, startColumn, endColumn) {
        if (startColumn == endColumn)
            return;

        var range = new Range(row, startColumn, row, endColumn);
        var line = this.getLine(row);
        var removed = line.substring(startColumn, endColumn);
        var newLine = line.substring(0, startColumn) + line.substring(endColumn, line.length);
        this.$lines.splice(row, 1, newLine);

        var delta = {
            action: "removeText",
            range: range,
            text: removed
        };
        this._signal("change", { data: delta });
        return range.start;
    };
    this.removeLines = function(firstRow, lastRow) {
        if (firstRow < 0 || lastRow >= this.getLength())
            return this.remove(new Range(firstRow, 0, lastRow + 1, 0));
        return this._removeLines(firstRow, lastRow);
    };

    this._removeLines = function(firstRow, lastRow) {
        var range = new Range(firstRow, 0, lastRow + 1, 0);
        var removed = this.$lines.splice(firstRow, lastRow - firstRow + 1);

        var delta = {
            action: "removeLines",
            range: range,
            nl: this.getNewLineCharacter(),
            lines: removed
        };
        this._signal("change", { data: delta });
        return removed;
    };
    this.removeNewLine = function(row) {
        var firstLine = this.getLine(row);
        var secondLine = this.getLine(row+1);

        var range = new Range(row, firstLine.length, row+1, 0);
        var line = firstLine + secondLine;

        this.$lines.splice(row, 2, line);

        var delta = {
            action: "removeText",
            range: range,
            text: this.getNewLineCharacter()
        };
        this._signal("change", { data: delta });
    };
    this.replace = function(range, text) {
        if (!(range instanceof Range))
            range = Range.fromPoints(range.start, range.end);
        if (text.length == 0 && range.isEmpty())
            return range.start;
        if (text == this.getTextRange(range))
            return range.end;

        this.remove(range);
        if (text) {
            var end = this.insert(range.start, text);
        }
        else {
            end = range.start;
        }

        return end;
    };
    this.applyDeltas = function(deltas) {
        for (var i=0; i<deltas.length; i++) {
            var delta = deltas[i];
            var range = Range.fromPoints(delta.range.start, delta.range.end);

            if (delta.action == "insertLines")
                this.insertLines(range.start.row, delta.lines);
            else if (delta.action == "insertText")
                this.insert(range.start, delta.text);
            else if (delta.action == "removeLines")
                this._removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "removeText")
                this.remove(range);
        }
    };
    this.revertDeltas = function(deltas) {
        for (var i=deltas.length-1; i>=0; i--) {
            var delta = deltas[i];

            var range = Range.fromPoints(delta.range.start, delta.range.end);

            if (delta.action == "insertLines")
                this._removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "insertText")
                this.remove(range);
            else if (delta.action == "removeLines")
                this._insertLines(range.start.row, delta.lines);
            else if (delta.action == "removeText")
                this.insert(range.start, delta.text);
        }
    };
    this.indexToPosition = function(index, startRow) {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        for (var i = startRow || 0, l = lines.length; i < l; i++) {
            index -= lines[i].length + newlineLength;
            if (index < 0)
                return {row: i, column: index + lines[i].length + newlineLength};
        }
        return {row: l-1, column: lines[l-1].length};
    };
    this.positionToIndex = function(pos, startRow) {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        var index = 0;
        var row = Math.min(pos.row, lines.length);
        for (var i = startRow || 0; i < row; ++i)
            index += lines[i].length + newlineLength;

        return index + pos.column;
    };

}).call(Document.prototype);

exports.Document = Document;
});

define("ace/lib/lang",["require","exports","module"], function(require, exports, module) {
"use strict";

exports.last = function(a) {
    return a[a.length - 1];
};

exports.stringReverse = function(string) {
    return string.split("").reverse().join("");
};

exports.stringRepeat = function (string, count) {
    var result = '';
    while (count > 0) {
        if (count & 1)
            result += string;

        if (count >>= 1)
            string += string;
    }
    return result;
};

var trimBeginRegexp = /^\s\s*/;
var trimEndRegexp = /\s\s*$/;

exports.stringTrimLeft = function (string) {
    return string.replace(trimBeginRegexp, '');
};

exports.stringTrimRight = function (string) {
    return string.replace(trimEndRegexp, '');
};

exports.copyObject = function(obj) {
    var copy = {};
    for (var key in obj) {
        copy[key] = obj[key];
    }
    return copy;
};

exports.copyArray = function(array){
    var copy = [];
    for (var i=0, l=array.length; i<l; i++) {
        if (array[i] && typeof array[i] == "object")
            copy[i] = this.copyObject( array[i] );
        else 
            copy[i] = array[i];
    }
    return copy;
};

exports.deepCopy = function deepCopy(obj) {
    if (typeof obj !== "object" || !obj)
        return obj;
    var copy;
    if (Array.isArray(obj)) {
        copy = [];
        for (var key = 0; key < obj.length; key++) {
            copy[key] = deepCopy(obj[key]);
        }
        return copy;
    }
    var cons = obj.constructor;
    if (cons === RegExp)
        return obj;
    
    copy = cons();
    for (var key in obj) {
        copy[key] = deepCopy(obj[key]);
    }
    return copy;
};

exports.arrayToMap = function(arr) {
    var map = {};
    for (var i=0; i<arr.length; i++) {
        map[arr[i]] = 1;
    }
    return map;

};

exports.createMap = function(props) {
    var map = Object.create(null);
    for (var i in props) {
        map[i] = props[i];
    }
    return map;
};
exports.arrayRemove = function(array, value) {
  for (var i = 0; i <= array.length; i++) {
    if (value === array[i]) {
      array.splice(i, 1);
    }
  }
};

exports.escapeRegExp = function(str) {
    return str.replace(/([.*+?^${}()|[\]\/\\])/g, '\\$1');
};

exports.escapeHTML = function(str) {
    return str.replace(/&/g, "&#38;").replace(/"/g, "&#34;").replace(/'/g, "&#39;").replace(/</g, "&#60;");
};

exports.getMatchOffsets = function(string, regExp) {
    var matches = [];

    string.replace(regExp, function(str) {
        matches.push({
            offset: arguments[arguments.length-2],
            length: str.length
        });
    });

    return matches;
};
exports.deferredCall = function(fcn) {
    var timer = null;
    var callback = function() {
        timer = null;
        fcn();
    };

    var deferred = function(timeout) {
        deferred.cancel();
        timer = setTimeout(callback, timeout || 0);
        return deferred;
    };

    deferred.schedule = deferred;

    deferred.call = function() {
        this.cancel();
        fcn();
        return deferred;
    };

    deferred.cancel = function() {
        clearTimeout(timer);
        timer = null;
        return deferred;
    };
    
    deferred.isPending = function() {
        return timer;
    };

    return deferred;
};


exports.delayedCall = function(fcn, defaultTimeout) {
    var timer = null;
    var callback = function() {
        timer = null;
        fcn();
    };

    var _self = function(timeout) {
        if (timer == null)
            timer = setTimeout(callback, timeout || defaultTimeout);
    };

    _self.delay = function(timeout) {
        timer && clearTimeout(timer);
        timer = setTimeout(callback, timeout || defaultTimeout);
    };
    _self.schedule = _self;

    _self.call = function() {
        this.cancel();
        fcn();
    };

    _self.cancel = function() {
        timer && clearTimeout(timer);
        timer = null;
    };

    _self.isPending = function() {
        return timer;
    };

    return _self;
};
});

define("ace/worker/mirror",["require","exports","module","ace/document","ace/lib/lang"], function(require, exports, module) {
"use strict";

var Document = require("../document").Document;
var lang = require("../lib/lang");
    
var Mirror = exports.Mirror = function(sender) {
    this.sender = sender;
    var doc = this.doc = new Document("");
    
    var deferredUpdate = this.deferredUpdate = lang.delayedCall(this.onUpdate.bind(this));
    
    var _self = this;
    sender.on("change", function(e) {
        doc.applyDeltas(e.data);
        if (_self.$timeout)
            return deferredUpdate.schedule(_self.$timeout);
        _self.onUpdate();
    });
};

(function() {
    
    this.$timeout = 500;
    
    this.setTimeout = function(timeout) {
        this.$timeout = timeout;
    };
    
    this.setValue = function(value) {
        this.doc.setValue(value);
        this.deferredUpdate.schedule(this.$timeout);
    };
    
    this.getValue = function(callbackId) {
        this.sender.callback(this.doc.getValue(), callbackId);
    };
    
    this.onUpdate = function() {
    };
    
    this.isPending = function() {
        return this.deferredUpdate.isPending();
    };
    
}).call(Mirror.prototype);

});

define("ace/mode/cql/antlr4/Token",["require","exports","module"], function(require, exports, module) {

function Token() {
	this.source = null;
	this.type = null; // token type of the token
	this.channel = null; // The parser ignores everything not on DEFAULT_CHANNEL
	this.start = null; // optional; return -1 if not implemented.
	this.stop = null; // optional; return -1 if not implemented.
	this.tokenIndex = null; // from 0..n-1 of the token object in the input stream
	this.line = null; // line=1..n of the 1st character
	this.column = null; // beginning of the line at which it occurs, 0..n-1
	this._text = null; // text of the token.
	return this;
}

Token.INVALID_TYPE = 0;
Token.EPSILON = -2;

Token.MIN_USER_TOKEN_TYPE = 1;

Token.EOF = -1;

Token.DEFAULT_CHANNEL = 0;

Token.HIDDEN_CHANNEL = 1;

Object.defineProperty(Token.prototype, "text", {
	get : function() {
		return this._text;
	},
	set : function(text) {
		this._text = text;
	}
});

Token.prototype.getTokenSource = function() {
	return this.source[0];
};

Token.prototype.getInputStream = function() {
	return this.source[1];
};

function CommonToken(source, type, channel, start, stop) {
	Token.call(this);
	this.source = source !== undefined ? source : CommonToken.EMPTY_SOURCE;
	this.type = type !== undefined ? type : null;
	this.channel = channel !== undefined ? channel : Token.DEFAULT_CHANNEL;
	this.start = start !== undefined ? start : -1;
	this.stop = stop !== undefined ? stop : -1;
	this.tokenIndex = -1;
	if (this.source[0] !== null) {
		this.line = source[0].line;
		this.column = source[0].column;
	} else {
		this.column = -1;
	}
	return this;
}

CommonToken.prototype = Object.create(Token.prototype);
CommonToken.prototype.constructor = CommonToken;
CommonToken.EMPTY_SOURCE = [ null, null ];
CommonToken.prototype.clone = function() {
	var t = new CommonToken(this.source, this.type, this.channel, this.start,
			this.stop);
	t.tokenIndex = this.tokenIndex;
	t.line = this.line;
	t.column = this.column;
	t.text = this.text;
	return t;
};

Object.defineProperty(CommonToken.prototype, "text", {
	get : function() {
		if (this._text !== null) {
			return this._text;
		}
		var input = this.getInputStream();
		if (input === null) {
			return null;
		}
		var n = input.size;
		if (this.start < n && this.stop < n) {
			return input.getText(this.start, this.stop);
		} else {
			return "<EOF>";
		}
	},
	set : function(text) {
		this._text = text;
	}
});

CommonToken.prototype.toString = function() {
	var txt = this.text;
	if (txt !== null) {
		txt = txt.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
	} else {
		txt = "<no text>";
	}
	return "[@" + this.tokenIndex + "," + this.start + ":" + this.stop + "='" +
			txt + "',<" + this.type + ">" +
			(this.channel > 0 ? ",channel=" + this.channel : "") + "," +
			this.line + ":" + this.column + "]";
};

exports.Token = Token;
exports.CommonToken = CommonToken;
});

define("ace/mode/cql/antlr4/IntervalSet",["require","exports","module","ace/mode/cql/antlr4/Token"], function(require, exports, module) {

var Token = require('./Token').Token;
function Interval(start, stop) {
	this.start = start;
	this.stop = stop;
	return this;
}

Interval.prototype.contains = function(item) {
	return item >= this.start && item < this.stop;
};

Interval.prototype.toString = function() {
	if(this.start===this.stop-1) {
		return this.start.toString();
	} else {
		return this.start.toString() + ".." + (this.stop-1).toString();
	}
};


Object.defineProperty(Interval.prototype, "length", {
	get : function() {
		return this.stop - this.start;
	}
});

function IntervalSet() {
	this.intervals = null;
	this.readOnly = false;
}

IntervalSet.prototype.first = function(v) {
	if (this.intervals === null || this.intervals.length===0) {
		return Token.INVALID_TYPE;
	} else {
		return this.intervals[0].start;
	}
};

IntervalSet.prototype.addOne = function(v) {
	this.addInterval(new Interval(v, v + 1));
};

IntervalSet.prototype.addRange = function(l, h) {
	this.addInterval(new Interval(l, h + 1));
};

IntervalSet.prototype.addInterval = function(v) {
	if (this.intervals === null) {
		this.intervals = [];
		this.intervals.push(v);
	} else {
		for (var k = 0; k < this.intervals.length; k++) {
			var i = this.intervals[k];
			if (v.stop < i.start) {
				this.intervals.splice(k, 0, v);
				return;
			}
			else if (v.stop === i.start) {
				this.intervals[k].start = v.start;
				return;
			}
			else if (v.start <= i.stop) {
				this.intervals[k] = new Interval(Math.min(i.start, v.start), Math.max(i.stop, v.stop));
				this.reduce(k);
				return;
			}
		}
		this.intervals.push(v);
	}
};

IntervalSet.prototype.addSet = function(other) {
	if (other.intervals !== null) {
		for (var k = 0; k < other.intervals.length; k++) {
			var i = other.intervals[k];
			this.addInterval(new Interval(i.start, i.stop));
		}
	}
	return this;
};

IntervalSet.prototype.reduce = function(k) {
	if (k < this.intervalslength - 1) {
		var l = this.intervals[k];
		var r = this.intervals[k + 1];
		if (l.stop >= r.stop) {
			this.intervals.pop(k + 1);
			this.reduce(k);
		} else if (l.stop >= r.start) {
			this.intervals[k] = new Interval(l.start, r.stop);
			this.intervals.pop(k + 1);
		}
	}
};

IntervalSet.prototype.complement = function(start, stop) {
    var result = new IntervalSet();
    result.addInterval(new Interval(start,stop+1));
    for(var i=0; i<this.intervals.length; i++) {
        result.removeRange(this.intervals[i]);
    }
    return result;
};

IntervalSet.prototype.contains = function(item) {
	if (this.intervals === null) {
		return false;
	} else {
		for (var k = 0; k < this.intervals.length; k++) {
			if(this.intervals[k].contains(item)) {
				return true;
			}
		}
		return false;
	}
};

Object.defineProperty(IntervalSet.prototype, "length", {
	get : function() {
		var len = 0;
		this.intervals.map(function(i) {len += i.length;});
		return len;
	}
});

IntervalSet.prototype.removeRange = function(v) {
    if(v.start===v.stop-1) {
        this.removeOne(v.start);
    } else if (this.intervals!==null) {
        var k = 0;
        for(var n=0; n<this.intervals.length; n++) {
            var i = this.intervals[k];
            if (v.stop<=i.start) {
                return;
            }
            else if(v.start>i.start && v.stop<i.stop) {
                this.intervals[k] = new Interval(i.start, v.start);
                var x = new Interval(v.stop, i.stop);
                this.intervals.splice(k, 0, x);
                return;
            }
            else if(v.start<=i.start && v.stop>=i.stop) {
                this.intervals.splice(k, 1);
                k = k - 1; // need another pass
            }
            else if(v.start<i.stop) {
                this.intervals[k] = new Interval(i.start, v.start);
            }
            else if(v.stop<i.stop) {
                this.intervals[k] = new Interval(v.stop, i.stop);
            }
            k += 1;
        }
    }
};

IntervalSet.prototype.removeOne = function(v) {
	if (this.intervals !== null) {
		for (var k = 0; k < this.intervals.length; k++) {
			var i = this.intervals[k];
			if (v < i.start) {
				return;
			}
			else if (v === i.start && v === i.stop - 1) {
				this.intervals.splice(k, 1);
				return;
			}
			else if (v === i.start) {
				this.intervals[k] = new Interval(i.start + 1, i.stop);
				return;
			}
			else if (v === i.stop - 1) {
				this.intervals[k] = new Interval(i.start, i.stop - 1);
				return;
			}
			else if (v < i.stop - 1) {
				var x = new Interval(i.start, v);
				i.start = v + 1;
				this.intervals.splice(k, 0, x);
				return;
			}
		}
	}
};

IntervalSet.prototype.toString = function(literalNames, symbolicNames, elemsAreChar) {
	literalNames = literalNames || null;
	symbolicNames = symbolicNames || null;
	elemsAreChar = elemsAreChar || false;
	if (this.intervals === null) {
		return "{}";
	} else if(literalNames!==null || symbolicNames!==null) {
		return this.toTokenString(literalNames, symbolicNames);
	} else if(elemsAreChar) {
		return this.toCharString();
	} else {
		return this.toIndexString();
	}
};

IntervalSet.prototype.toCharString = function() {
	var names = [];
	for (var i = 0; i < this.intervals.length; i++) {
		var v = this.intervals[i];
		if(v.stop===v.start+1) {
			if ( v.start===Token.EOF ) {
				names.push("<EOF>");
			} else {
				names.push("'" + String.fromCharCode(v.start) + "'");
			}
		} else {
			names.push("'" + String.fromCharCode(v.start) + "'..'" + String.fromCharCode(v.stop-1) + "'");
		}
	}
	if (names.length > 1) {
		return "{" + names.join(", ") + "}";
	} else {
		return names[0];
	}
};


IntervalSet.prototype.toIndexString = function() {
	var names = [];
	for (var i = 0; i < this.intervals.length; i++) {
		var v = this.intervals[i];
		if(v.stop===v.start+1) {
			if ( v.start===Token.EOF ) {
				names.push("<EOF>");
			} else {
				names.push(v.start.toString());
			}
		} else {
			names.push(v.start.toString() + ".." + (v.stop-1).toString());
		}
	}
	if (names.length > 1) {
		return "{" + names.join(", ") + "}";
	} else {
		return names[0];
	}
};


IntervalSet.prototype.toTokenString = function(literalNames, symbolicNames) {
	var names = [];
	for (var i = 0; i < this.intervals.length; i++) {
		var v = this.intervals[i];
		for (var j = v.start; j < v.stop; j++) {
			names.push(this.elementName(literalNames, symbolicNames, j));
		}
	}
	if (names.length > 1) {
		return "{" + names.join(", ") + "}";
	} else {
		return names[0];
	}
};

IntervalSet.prototype.elementName = function(literalNames, symbolicNames, a) {
	if (a === Token.EOF) {
		return "<EOF>";
	} else if (a === Token.EPSILON) {
		return "<EPSILON>";
	} else {
		return literalNames[a] || symbolicNames[a];
	}
};

exports.Interval = Interval;
exports.IntervalSet = IntervalSet;
});

define("ace/mode/cql/antlr4/tree/Tree",["require","exports","module","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/IntervalSet"], function(require, exports, module) {

var Token = require('./../Token').Token;
var Interval = require('./../IntervalSet').Interval;
var INVALID_INTERVAL = new Interval(-1, -2);

function Tree() {
	return this;
}

function SyntaxTree() {
	Tree.call(this);
	return this;
}

SyntaxTree.prototype = Object.create(Tree.prototype);
SyntaxTree.prototype.constructor = SyntaxTree;

function ParseTree() {
	SyntaxTree.call(this);
	return this;
}

ParseTree.prototype = Object.create(SyntaxTree.prototype);
ParseTree.prototype.constructor = ParseTree;

function RuleNode() {
	ParseTree.call(this);
	return this;
}

RuleNode.prototype = Object.create(ParseTree.prototype);
RuleNode.prototype.constructor = RuleNode;

function TerminalNode() {
	ParseTree.call(this);
	return this;
}

TerminalNode.prototype = Object.create(ParseTree.prototype);
TerminalNode.prototype.constructor = TerminalNode;

function ErrorNode() {
	TerminalNode.call(this);
	return this;
}

ErrorNode.prototype = Object.create(TerminalNode.prototype);
ErrorNode.prototype.constructor = ErrorNode;

function ParseTreeVisitor() {
	return this;
}

function ParseTreeListener() {
	return this;
}

ParseTreeListener.prototype.visitTerminal = function(node) {
};

ParseTreeListener.prototype.visitErrorNode = function(node) {
};

ParseTreeListener.prototype.enterEveryRule = function(node) {
};

ParseTreeListener.prototype.exitEveryRule = function(node) {
};

function TerminalNodeImpl(symbol) {
	TerminalNode.call(this);
	this.parentCtx = null;
	this.symbol = symbol;
	return this;
}

TerminalNodeImpl.prototype = Object.create(TerminalNode.prototype);
TerminalNodeImpl.prototype.constructor = TerminalNodeImpl;

TerminalNodeImpl.prototype.getChild = function(i) {
	return null;
};

TerminalNodeImpl.prototype.getSymbol = function() {
	return this.symbol;
};

TerminalNodeImpl.prototype.getParent = function() {
	return this.parentCtx;
};

TerminalNodeImpl.prototype.getPayload = function() {
	return this.symbol;
};

TerminalNodeImpl.prototype.getSourceInterval = function() {
	if (this.symbol === null) {
		return INVALID_INTERVAL;
	}
	var tokenIndex = this.symbol.tokenIndex;
	return new Interval(tokenIndex, tokenIndex);
};

TerminalNodeImpl.prototype.getChildCount = function() {
	return 0;
};

TerminalNodeImpl.prototype.accept = function(visitor) {
	return visitor.visitTerminal(this);
};

TerminalNodeImpl.prototype.getText = function() {
	return this.symbol.text;
};

TerminalNodeImpl.prototype.toString = function() {
	if (this.symbol.type === Token.EOF) {
		return "<EOF>";
	} else {
		return this.symbol.text;
	}
};

function ErrorNodeImpl(token) {
	TerminalNodeImpl.call(this, token);
	return this;
}

ErrorNodeImpl.prototype = Object.create(TerminalNodeImpl.prototype);
ErrorNodeImpl.prototype.constructor = ErrorNodeImpl;

ErrorNodeImpl.prototype.isErrorNode = function() {
	return true;
};

ErrorNodeImpl.prototype.accept = function(visitor) {
	return visitor.visitErrorNode(this);
};

function ParseTreeWalker() {
	return this;
}

ParseTreeWalker.prototype.walk = function(listener, t) {
	var errorNode = t instanceof ErrorNode ||
			(t.isErrorNode !== undefined && t.isErrorNode());
	if (errorNode) {
		listener.visitErrorNode(t);
	} else if (t instanceof TerminalNode) {
		listener.visitTerminal(t);
	} else {
		this.enterRule(listener, t);
		for (var i = 0; i < t.getChildCount(); i++) {
			var child = t.getChild(i);
			this.walk(listener, child);
		}
		this.exitRule(listener, t);
	}
};
ParseTreeWalker.prototype.enterRule = function(listener, r) {
	var ctx = r.getRuleContext();
	listener.enterEveryRule(ctx);
	ctx.enterRule(listener);
};

ParseTreeWalker.prototype.exitRule = function(listener, r) {
	var ctx = r.getRuleContext();
	ctx.exitRule(listener);
	listener.exitEveryRule(ctx);
};

ParseTreeWalker.DEFAULT = new ParseTreeWalker();

exports.RuleNode = RuleNode;
exports.ErrorNode = ErrorNode;
exports.TerminalNode = TerminalNode;
exports.ErrorNodeImpl = ErrorNodeImpl;
exports.TerminalNodeImpl = TerminalNodeImpl;
exports.ParseTreeListener = ParseTreeListener;
exports.ParseTreeVisitor = ParseTreeVisitor;
exports.ParseTreeWalker = ParseTreeWalker;
exports.INVALID_INTERVAL = INVALID_INTERVAL;
});

define("ace/mode/cql/antlr4/tree/index",["require","exports","module","ace/mode/cql/antlr4/tree/Tree","ace/mode/cql/antlr4/tree/Tree"], function(require, exports, module) {
  var Tree = require('./Tree');
exports.Trees = require('./Tree').Trees;
exports.RuleNode = Tree.RuleNode;
exports.ParseTreeListener = Tree.ParseTreeListener;
exports.ParseTreeVisitor = Tree.ParseTreeVisitor;
exports.ParseTreeWalker = Tree.ParseTreeWalker;
});

define("ace/mode/cql/antlr4/Utils",["require","exports","module"], function(require, exports, module) {
	function arrayToString(a) {
	return "[" + a.join(", ") + "]";
}

String.prototype.hashCode = function(s) {
	var hash = 0;
	if (this.length === 0) {
		return hash;
	}
	for (var i = 0; i < this.length; i++) {
		var character = this.charCodeAt(i);
		hash = ((hash << 5) - hash) + character;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash;
};

function standardEqualsFunction(a,b) {
	return a.equals(b);
}

function standardHashFunction(a) {
	return a.hashString();
}

function Set(hashFunction, equalsFunction) {
	this.data = {};
	this.hashFunction = hashFunction || standardHashFunction;
	this.equalsFunction = equalsFunction || standardEqualsFunction;
	return this;
}

Object.defineProperty(Set.prototype, "length", {
	get : function() {
		return this.values().length;
	}
});

Set.prototype.add = function(value) {
	var hash = this.hashFunction(value);
	var key = "hash_" + hash.hashCode();
	if(key in this.data) {
		var i;
		var values = this.data[key];
		for(i=0;i<values.length; i++) {
			if(this.equalsFunction(value, values[i])) {
				return values[i];
			}
		}
		values.push(value);
		return value;
	} else {
		this.data[key] = [ value ];
		return value;
	}
};

Set.prototype.contains = function(value) {
	var hash = this.hashFunction(value);
	var key = hash.hashCode();
	if(key in this.data) {
		var i;
		var values = this.data[key];
		for(i=0;i<values.length; i++) {
			if(this.equalsFunction(value, values[i])) {
				return true;
			}
		}
	}
	return false;
};

Set.prototype.values = function() {
	var l = [];
	for(var key in this.data) {
		if(key.indexOf("hash_")===0) {
			l = l.concat(this.data[key]);
		}
	}
	return l;
};

Set.prototype.toString = function() {
	return arrayToString(this.values());
};

function BitSet() {
	this.data = [];
	return this;
}

BitSet.prototype.add = function(value) {
	this.data[value] = true;
};

BitSet.prototype.or = function(set) {
	var bits = this;
	Object.keys(set.data).map( function(alt) { bits.add(alt); });
};

BitSet.prototype.remove = function(value) {
	delete this.data[value];
};

BitSet.prototype.contains = function(value) {
	return this.data[value] === true;
};

BitSet.prototype.values = function() {
	return Object.keys(this.data);
};

BitSet.prototype.minValue = function() {
	return Math.min.apply(null, this.values());
};

BitSet.prototype.hashString = function() {
	return this.values().toString();
};

BitSet.prototype.equals = function(other) {
	if(!(other instanceof BitSet)) {
		return false;
	}
	return this.hashString()===other.hashString();
};

Object.defineProperty(BitSet.prototype, "length", {
	get : function() {
		return this.values().length;
	}
});

BitSet.prototype.toString = function() {
	return "{" + this.values().join(", ") + "}";
};

function AltDict() {
	this.data = {};
	return this;
}

AltDict.prototype.get = function(key) {
	key = "k-" + key;
	if(key in this.data){
		return this.data[key];
	} else {
		return null;
	}
};

AltDict.prototype.put = function(key, value) {
	key = "k-" + key;
	this.data[key] = value;
};

AltDict.prototype.values = function() {
	var data = this.data;
	var keys = Object.keys(this.data);
	return keys.map(function(key) {
		return data[key];
	});
};

function DoubleDict() {
	return this;
}

DoubleDict.prototype.get = function(a, b) {
	var d = this[a] || null;
	return d===null ? null : (d[b] || null);
};

DoubleDict.prototype.set = function(a, b, o) {
	var d = this[a] || null;
	if(d===null) {
		d = {};
		this[a] = d;
	}
	d[b] = o;
};


function escapeWhitespace(s, escapeSpaces) {
	s = s.replace("\t","\\t");
	s = s.replace("\n","\\n");
	s = s.replace("\r","\\r");
	if(escapeSpaces) {
		s = s.replace(" ","\u00B7");
	}
	return s;
}


exports.Set = Set;
exports.BitSet = BitSet;
exports.AltDict = AltDict;
exports.DoubleDict = DoubleDict;
exports.escapeWhitespace = escapeWhitespace;
exports.arrayToString = arrayToString;
});

define("ace/mode/cql/antlr4/atn/SemanticContext",["require","exports","module","ace/mode/cql/antlr4/Utils"], function(require, exports, module) {

var Set = require('./../Utils').Set;

function SemanticContext() {
	return this;
}
SemanticContext.prototype.evaluate = function(parser, outerContext) {
};
SemanticContext.prototype.evalPrecedence = function(parser, outerContext) {
	return this;
};

SemanticContext.andContext = function(a, b) {
	if (a === null || a === SemanticContext.NONE) {
		return b;
	}
	if (b === null || b === SemanticContext.NONE) {
		return a;
	}
	var result = new AND(a, b);
	if (result.opnds.length === 1) {
		return result.opnds[0];
	} else {
		return result;
	}
};

SemanticContext.orContext = function(a, b) {
	if (a === null) {
		return b;
	}
	if (b === null) {
		return a;
	}
	if (a === SemanticContext.NONE || b === SemanticContext.NONE) {
		return SemanticContext.NONE;
	}
	var result = new OR(a, b);
	if (result.opnds.length === 1) {
		return result.opnds[0];
	} else {
		return result;
	}
};

function Predicate(ruleIndex, predIndex, isCtxDependent) {
	SemanticContext.call(this);
	this.ruleIndex = ruleIndex === undefined ? -1 : ruleIndex;
	this.predIndex = predIndex === undefined ? -1 : predIndex;
	this.isCtxDependent = isCtxDependent === undefined ? false : isCtxDependent; // e.g., $i ref in pred
	return this;
}

Predicate.prototype = Object.create(SemanticContext.prototype);
Predicate.prototype.constructor = Predicate;
SemanticContext.NONE = new Predicate();


Predicate.prototype.evaluate = function(parser, outerContext) {
	var localctx = this.isCtxDependent ? outerContext : null;
	return parser.sempred(localctx, this.ruleIndex, this.predIndex);
};

Predicate.prototype.hashString = function() {
	return "" + this.ruleIndex + "/" + this.predIndex + "/" + this.isCtxDependent;
};

Predicate.prototype.equals = function(other) {
	if (this === other) {
		return true;
	} else if (!(other instanceof Predicate)) {
		return false;
	} else {
		return this.ruleIndex === other.ruleIndex &&
				this.predIndex === other.predIndex &&
				this.isCtxDependent === other.isCtxDependent;
	}
};

Predicate.prototype.toString = function() {
	return "{" + this.ruleIndex + ":" + this.predIndex + "}?";
};

function PrecedencePredicate(precedence) {
	SemanticContext.call(this);
	this.precedence = precedence === undefined ? 0 : precedence;
}

PrecedencePredicate.prototype = Object.create(SemanticContext.prototype);
PrecedencePredicate.prototype.constructor = PrecedencePredicate;

PrecedencePredicate.prototype.evaluate = function(parser, outerContext) {
	return parser.precpred(outerContext, this.precedence);
};

PrecedencePredicate.prototype.evalPrecedence = function(parser, outerContext) {
	if (parser.precpred(outerContext, this.precedence)) {
		return SemanticContext.NONE;
	} else {
		return null;
	}
};

PrecedencePredicate.prototype.compareTo = function(other) {
	return this.precedence - other.precedence;
};

PrecedencePredicate.prototype.hashString = function() {
	return "31";
};

PrecedencePredicate.prototype.equals = function(other) {
	if (this === other) {
		return true;
	} else if (!(other instanceof PrecedencePredicate)) {
		return false;
	} else {
		return this.precedence === other.precedence;
	}
};

PrecedencePredicate.prototype.toString = function() {
	return "{"+this.precedence+">=prec}?";
};



PrecedencePredicate.filterPrecedencePredicates = function(set) {
	var result = [];
	set.values().map( function(context) {
		if (context instanceof PrecedencePredicate) {
			result.push(context);
		}
	});
	return result;
};
function AND(a, b) {
	SemanticContext.call(this);
	var operands = new Set();
	if (a instanceof AND) {
		a.opnds.map(function(o) {
			operands.add(o);
		});
	} else {
		operands.add(a);
	}
	if (b instanceof AND) {
		b.opnds.map(function(o) {
			operands.add(o);
		});
	} else {
		operands.add(b);
	}
	var precedencePredicates = PrecedencePredicate.filterPrecedencePredicates(operands);
	if (precedencePredicates.length > 0) {
		var reduced = null;
		precedencePredicates.map( function(p) {
			if(reduced===null || p.precedence<reduced.precedence) {
				reduced = p;
			}
		});
		operands.add(reduced);
	}
	this.opnds = operands.values();
	return this;
}

AND.prototype = Object.create(SemanticContext.prototype);
AND.prototype.constructor = AND;

AND.prototype.equals = function(other) {
	if (this === other) {
		return true;
	} else if (!(other instanceof AND)) {
		return false;
	} else {
		return this.opnds === other.opnds;
	}
};

AND.prototype.hashString = function() {
	return "" + this.opnds + "/AND";
};
AND.prototype.evaluate = function(parser, outerContext) {
	for (var i = 0; i < this.opnds.length; i++) {
		if (!this.opnds[i].evaluate(parser, outerContext)) {
			return false;
		}
	}
	return true;
};

AND.prototype.evalPrecedence = function(parser, outerContext) {
	var differs = false;
	var operands = [];
	for (var i = 0; i < this.opnds.length; i++) {
		var context = this.opnds[i];
		var evaluated = context.evalPrecedence(parser, outerContext);
		differs |= (evaluated !== context);
		if (evaluated === null) {
			return null;
		} else if (evaluated !== SemanticContext.NONE) {
			operands.push(evaluated);
		}
	}
	if (!differs) {
		return this;
	}
	if (operands.length === 0) {
		return SemanticContext.NONE;
	}
	var result = null;
	operands.map(function(o) {
		result = result === null ? o : SemanticPredicate.andContext(result, o);
	});
	return result;
};

AND.prototype.toString = function() {
	var s = "";
	this.opnds.map(function(o) {
		s += "&& " + o.toString();
	});
	return s.length > 3 ? s.slice(3) : s;
};
function OR(a, b) {
	SemanticContext.call(this);
	var operands = new Set();
	if (a instanceof OR) {
		a.opnds.map(function(o) {
			operands.add(o);
		});
	} else {
		operands.add(a);
	}
	if (b instanceof OR) {
		b.opnds.map(function(o) {
			operands.add(o);
		});
	} else {
		operands.add(b);
	}

	var precedencePredicates = PrecedencePredicate.filterPrecedencePredicates(operands);
	if (precedencePredicates.length > 0) {
		var s = precedencePredicates.sort(function(a, b) {
			return a.compareTo(b);
		});
		var reduced = s[s.length-1];
		operands.add(reduced);
	}
	this.opnds = operands.values();
	return this;
}

OR.prototype = Object.create(SemanticContext.prototype);
OR.prototype.constructor = OR;

OR.prototype.constructor = function(other) {
	if (this === other) {
		return true;
	} else if (!(other instanceof OR)) {
		return false;
	} else {
		return this.opnds === other.opnds;
	}
};

OR.prototype.hashString = function() {
	return "" + this.opnds + "/OR"; 
};
OR.prototype.evaluate = function(parser, outerContext) {
	for (var i = 0; i < this.opnds.length; i++) {
		if (this.opnds[i].evaluate(parser, outerContext)) {
			return true;
		}
	}
	return false;
};

OR.prototype.evalPrecedence = function(parser, outerContext) {
	var differs = false;
	var operands = [];
	for (var i = 0; i < this.opnds.length; i++) {
		var context = this.opnds[i];
		var evaluated = context.evalPrecedence(parser, outerContext);
		differs |= (evaluated !== context);
		if (evaluated === SemanticContext.NONE) {
			return SemanticContext.NONE;
		} else if (evaluated !== null) {
			operands.push(evaluated);
		}
	}
	if (!differs) {
		return this;
	}
	if (operands.length === 0) {
		return null;
	}
	var result = null;
	operands.map(function(o) {
		return result === null ? o : SemanticContext.orContext(result, o);
	});
	return result;
};

AND.prototype.toString = function() {
	var s = "";
	this.opnds.map(function(o) {
		s += "|| " + o.toString();
	});
	return s.length > 3 ? s.slice(3) : s;
};

exports.SemanticContext = SemanticContext;
exports.PrecedencePredicate = PrecedencePredicate;
exports.Predicate = Predicate;
});

define("ace/mode/cql/antlr4/atn/Transition",["require","exports","module","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/IntervalSet","ace/mode/cql/antlr4/IntervalSet","ace/mode/cql/antlr4/atn/SemanticContext","ace/mode/cql/antlr4/atn/SemanticContext"], function(require, exports, module) {

var Token = require('./../Token').Token;
var Interval = require('./../IntervalSet').Interval;
var IntervalSet = require('./../IntervalSet').IntervalSet;
var Predicate = require('./SemanticContext').Predicate;
var PrecedencePredicate = require('./SemanticContext').PrecedencePredicate;

function Transition (target) {
    if (target===undefined || target===null) {
        throw "target cannot be null.";
    }
    this.target = target;
    this.isEpsilon = false;
    this.label = null;
    return this;
}
Transition.EPSILON = 1;
Transition.RANGE = 2;
Transition.RULE = 3;
Transition.PREDICATE = 4; // e.g., {isType(input.LT(1))}?
Transition.ATOM = 5;
Transition.ACTION = 6;
Transition.SET = 7; // ~(A|B) or ~atom, wildcard, which convert to next 2
Transition.NOT_SET = 8;
Transition.WILDCARD = 9;
Transition.PRECEDENCE = 10;

Transition.serializationNames = [
            "INVALID",
            "EPSILON",
            "RANGE",
            "RULE",
            "PREDICATE",
            "ATOM",
            "ACTION",
            "SET",
            "NOT_SET",
            "WILDCARD",
            "PRECEDENCE"
        ];

Transition.serializationTypes = {
        EpsilonTransition: Transition.EPSILON,
        RangeTransition: Transition.RANGE,
        RuleTransition: Transition.RULE,
        PredicateTransition: Transition.PREDICATE,
        AtomTransition: Transition.ATOM,
        ActionTransition: Transition.ACTION,
        SetTransition: Transition.SET,
        NotSetTransition: Transition.NOT_SET,
        WildcardTransition: Transition.WILDCARD,
        PrecedencePredicateTransition: Transition.PRECEDENCE
    };
function AtomTransition(target, label) {
	Transition.call(this, target);
	this.label_ = label; // The token type or character value; or, signifies special label.
    this.label = this.makeLabel();
    this.serializationType = Transition.ATOM;
    return this;
}

AtomTransition.prototype = Object.create(Transition.prototype);
AtomTransition.prototype.constructor = AtomTransition;

AtomTransition.prototype.makeLabel = function() {
	var s = new IntervalSet();
    s.addOne(this.label_);
    return s;
};

AtomTransition.prototype.matches = function( symbol, minVocabSymbol,  maxVocabSymbol) {
    return this.label_ === symbol;
};

AtomTransition.prototype.toString = function() {
	return this.label_;
};

function RuleTransition(ruleStart, ruleIndex, precedence, followState) {
	Transition.call(this, ruleStart);
    this.ruleIndex = ruleIndex; // ptr to the rule definition object for this rule ref
    this.precedence = precedence;
    this.followState = followState; // what node to begin computations following ref to rule
    this.serializationType = Transition.RULE;
    this.isEpsilon = true;
    return this;
}

RuleTransition.prototype = Object.create(Transition.prototype);
RuleTransition.prototype.constructor = RuleTransition;

RuleTransition.prototype.matches = function(symbol, minVocabSymbol,  maxVocabSymbol) {
	return false;
};


function EpsilonTransition(target, outermostPrecedenceReturn) {
	Transition.call(this, target);
    this.serializationType = Transition.EPSILON;
    this.isEpsilon = true;
    this.outermostPrecedenceReturn = outermostPrecedenceReturn;
    return this;
}

EpsilonTransition.prototype = Object.create(Transition.prototype);
EpsilonTransition.prototype.constructor = EpsilonTransition;

EpsilonTransition.prototype.matches = function( symbol, minVocabSymbol,  maxVocabSymbol) {
	return false;
};

EpsilonTransition.prototype.toString = function() {
	return "epsilon";
};

function RangeTransition(target, start, stop) {
	Transition.call(this, target);
	this.serializationType = Transition.RANGE;
    this.start = start;
    this.stop = stop;
    this.label = this.makeLabel();
    return this;
}

RangeTransition.prototype = Object.create(Transition.prototype);
RangeTransition.prototype.constructor = RangeTransition;

RangeTransition.prototype.makeLabel = function() {
    var s = new IntervalSet();
    s.addRange(this.start, this.stop);
    return s;
};

RangeTransition.prototype.matches = function(symbol, minVocabSymbol,  maxVocabSymbol) {
	return symbol >= this.start && symbol <= this.stop;
};

RangeTransition.prototype.toString = function() {
	return "'" + String.fromCharCode(this.start) + "'..'" + String.fromCharCode(this.stop) + "'";
};

function AbstractPredicateTransition(target) {
	Transition.call(this, target);
	return this;
}

AbstractPredicateTransition.prototype = Object.create(Transition.prototype);
AbstractPredicateTransition.prototype.constructor = AbstractPredicateTransition;

function PredicateTransition(target, ruleIndex, predIndex, isCtxDependent) {
	AbstractPredicateTransition.call(this, target);
    this.serializationType = Transition.PREDICATE;
    this.ruleIndex = ruleIndex;
    this.predIndex = predIndex;
    this.isCtxDependent = isCtxDependent; // e.g., $i ref in pred
    this.isEpsilon = true;
    return this;
}

PredicateTransition.prototype = Object.create(AbstractPredicateTransition.prototype);
PredicateTransition.prototype.constructor = PredicateTransition;

PredicateTransition.prototype.matches = function(symbol, minVocabSymbol,  maxVocabSymbol) {
	return false;
};

PredicateTransition.prototype.getPredicate = function() {
	return new Predicate(this.ruleIndex, this.predIndex, this.isCtxDependent);
};

PredicateTransition.prototype.toString = function() {
	return "pred_" + this.ruleIndex + ":" + this.predIndex;
};

function ActionTransition(target, ruleIndex, actionIndex, isCtxDependent) {
	Transition.call(this, target);
    this.serializationType = Transition.ACTION;
    this.ruleIndex = ruleIndex;
    this.actionIndex = actionIndex===undefined ? -1 : actionIndex;
    this.isCtxDependent = isCtxDependent===undefined ? false : isCtxDependent; // e.g., $i ref in pred
    this.isEpsilon = true;
    return this;
}

ActionTransition.prototype = Object.create(Transition.prototype);
ActionTransition.prototype.constructor = ActionTransition;


ActionTransition.prototype.matches = function(symbol, minVocabSymbol,  maxVocabSymbol) {
	return false;
};

ActionTransition.prototype.toString = function() {
	return "action_" + this.ruleIndex + ":" + this.actionIndex;
};
function SetTransition(target, set) {
	Transition.call(this, target);
	this.serializationType = Transition.SET;
    if (set !==undefined && set !==null) {
        this.label = set;
    } else {
        this.label = new IntervalSet();
        this.label.addOne(Token.INVALID_TYPE);
    }
    return this;
}

SetTransition.prototype = Object.create(Transition.prototype);
SetTransition.prototype.constructor = SetTransition;

SetTransition.prototype.matches = function(symbol, minVocabSymbol,  maxVocabSymbol) {
	return this.label.contains(symbol);
};
        

SetTransition.prototype.toString = function() {
	return this.label.toString();
};

function NotSetTransition(target, set) {
	SetTransition.call(this, target, set);
	this.serializationType = Transition.NOT_SET;
	return this;
}

NotSetTransition.prototype = Object.create(SetTransition.prototype);
NotSetTransition.prototype.constructor = NotSetTransition;

NotSetTransition.prototype.matches = function(symbol, minVocabSymbol,  maxVocabSymbol) {
	return symbol >= minVocabSymbol && symbol <= maxVocabSymbol &&
			!SetTransition.prototype.matches.call(this, symbol, minVocabSymbol, maxVocabSymbol);
};

NotSetTransition.prototype.toString = function() {
	return '~' + SetTransition.prototype.toString.call(this);
};

function WildcardTransition(target) {
	Transition.call(this, target);
	this.serializationType = Transition.WILDCARD;
	return this;
}

WildcardTransition.prototype = Object.create(Transition.prototype);
WildcardTransition.prototype.constructor = WildcardTransition;


WildcardTransition.prototype.matches = function(symbol, minVocabSymbol,  maxVocabSymbol) {
	return symbol >= minVocabSymbol && symbol <= maxVocabSymbol;
};

WildcardTransition.prototype.toString = function() {
	return ".";
};

function PrecedencePredicateTransition(target, precedence) {
	AbstractPredicateTransition.call(this, target);
    this.serializationType = Transition.PRECEDENCE;
    this.precedence = precedence;
    this.isEpsilon = true;
    return this;
}

PrecedencePredicateTransition.prototype = Object.create(AbstractPredicateTransition.prototype);
PrecedencePredicateTransition.prototype.constructor = PrecedencePredicateTransition;

PrecedencePredicateTransition.prototype.matches = function(symbol, minVocabSymbol,  maxVocabSymbol) {
	return false;
};

PrecedencePredicateTransition.prototype.getPredicate = function() {
	return new PrecedencePredicate(this.precedence);
};

PrecedencePredicateTransition.prototype.toString = function() {
	return this.precedence + " >= _p";
};
        
exports.Transition = Transition;
exports.AtomTransition = AtomTransition;
exports.SetTransition = SetTransition;
exports.NotSetTransition = NotSetTransition;
exports.RuleTransition = RuleTransition;
exports.ActionTransition = ActionTransition;
exports.EpsilonTransition = EpsilonTransition;
exports.RangeTransition = RangeTransition;
exports.WildcardTransition = WildcardTransition;
exports.PredicateTransition = PredicateTransition;
exports.PrecedencePredicateTransition = PrecedencePredicateTransition;
exports.AbstractPredicateTransition = AbstractPredicateTransition;
});

define("ace/mode/cql/antlr4/error/Errors",["require","exports","module","ace/mode/cql/antlr4/atn/Transition"], function(require, exports, module) {

var PredicateTransition = require('./../atn/Transition').PredicateTransition;

function RecognitionException(params) {
	Error.call(this);
	if (!!Error.captureStackTrace) {
        Error.captureStackTrace(this, RecognitionException);
	} else {
		var stack = new Error().stack;
	}
	this.message = params.message;
    this.recognizer = params.recognizer;
    this.input = params.input;
    this.ctx = params.ctx;
    this.offendingToken = null;
    this.offendingState = -1;
    if (this.recognizer!==null) {
        this.offendingState = this.recognizer.state;
    }
    return this;
}

RecognitionException.prototype = Object.create(Error.prototype);
RecognitionException.prototype.constructor = RecognitionException;
RecognitionException.prototype.getExpectedTokens = function() {
    if (this.recognizer!==null) {
        return this.recognizer.atn.getExpectedTokens(this.offendingState, this.ctx);
    } else {
        return null;
    }
};

RecognitionException.prototype.toString = function() {
    return this.message;
};

function LexerNoViableAltException(lexer, input, startIndex, deadEndConfigs) {
	RecognitionException.call(this, {message:"", recognizer:lexer, input:input, ctx:null});
    this.startIndex = startIndex;
    this.deadEndConfigs = deadEndConfigs;
    return this;
}

LexerNoViableAltException.prototype = Object.create(RecognitionException.prototype);
LexerNoViableAltException.prototype.constructor = LexerNoViableAltException;

LexerNoViableAltException.prototype.toString = function() {
    var symbol = "";
    if (this.startIndex >= 0 && this.startIndex < this.input.size) {
        symbol = this.input.getText((this.startIndex,this.startIndex));
    }
    return "LexerNoViableAltException" + symbol;
};
function NoViableAltException(recognizer, input, startToken, offendingToken, deadEndConfigs, ctx) {
	ctx = ctx || recognizer._ctx;
	offendingToken = offendingToken || recognizer.getCurrentToken();
	startToken = startToken || recognizer.getCurrentToken();
	input = input || recognizer.getInputStream();
	RecognitionException.call(this, {message:"", recognizer:recognizer, input:input, ctx:ctx});
    this.deadEndConfigs = deadEndConfigs;
    this.startToken = startToken;
    this.offendingToken = offendingToken;
}

NoViableAltException.prototype = Object.create(RecognitionException.prototype);
NoViableAltException.prototype.constructor = NoViableAltException;
function InputMismatchException(recognizer) {
	RecognitionException.call(this, {message:"", recognizer:recognizer, input:recognizer.getInputStream(), ctx:recognizer._ctx});
    this.offendingToken = recognizer.getCurrentToken();
}

InputMismatchException.prototype = Object.create(RecognitionException.prototype);
InputMismatchException.prototype.constructor = InputMismatchException;

function FailedPredicateException(recognizer, predicate, message) {
	RecognitionException.call(this, {message:this.formatMessage(predicate,message || null), recognizer:recognizer,
                         input:recognizer.getInputStream(), ctx:recognizer._ctx});
    var s = recognizer._interp.atn.states[recognizer.state];
    var trans = s.transitions[0];
    if (trans instanceof PredicateTransition) {
        this.ruleIndex = trans.ruleIndex;
        this.predicateIndex = trans.predIndex;
    } else {
        this.ruleIndex = 0;
        this.predicateIndex = 0;
    }
    this.predicate = predicate;
    this.offendingToken = recognizer.getCurrentToken();
    return this;
}

FailedPredicateException.prototype = Object.create(RecognitionException.prototype);
FailedPredicateException.prototype.constructor = FailedPredicateException;

FailedPredicateException.prototype.formatMessage = function(predicate, message) {
    if (message !==null) {
        return message;
    } else {
        return "failed predicate: {" + predicate + "}?";
    }
};

function ParseCancellationException() {
	Error.call(this);
	Error.captureStackTrace(this, ParseCancellationException);
	return this;
}

ParseCancellationException.prototype = Object.create(Error.prototype);
ParseCancellationException.prototype.constructor = ParseCancellationException;

exports.RecognitionException = RecognitionException;
exports.NoViableAltException = NoViableAltException;
exports.LexerNoViableAltException = LexerNoViableAltException;
exports.InputMismatchException = InputMismatchException;
exports.FailedPredicateException = FailedPredicateException;
});

define("ace/mode/cql/antlr4/error/ErrorListener",["require","exports","module"], function(require, exports, module) {

function ErrorListener() {
	return this;
}

ErrorListener.prototype.syntaxError = function(recognizer, offendingSymbol, line, column, msg, e) {
};

ErrorListener.prototype.reportAmbiguity = function(recognizer, dfa, startIndex, stopIndex, exact, ambigAlts, configs) {
};

ErrorListener.prototype.reportAttemptingFullContext = function(recognizer, dfa, startIndex, stopIndex, conflictingAlts, configs) {
};

ErrorListener.prototype.reportContextSensitivity = function(recognizer, dfa, startIndex, stopIndex, prediction, configs) {
};

function ConsoleErrorListener() {
	ErrorListener.call(this);
	return this;
}

ConsoleErrorListener.prototype = Object.create(ErrorListener.prototype);
ConsoleErrorListener.prototype.constructor = ConsoleErrorListener;
ConsoleErrorListener.INSTANCE = new ConsoleErrorListener();
ConsoleErrorListener.prototype.syntaxError = function(recognizer, offendingSymbol, line, column, msg, e) {
    console.error("line " + line + ":" + column + " " + msg);
};

function ProxyErrorListener(delegates) {
	ErrorListener.call(this);
    if (delegates===null) {
        throw "delegates";
    }
    this.delegates = delegates;
	return this;
}

ProxyErrorListener.prototype = Object.create(ErrorListener.prototype);
ProxyErrorListener.prototype.constructor = ProxyErrorListener;

ProxyErrorListener.prototype.syntaxError = function(recognizer, offendingSymbol, line, column, msg, e) {
    this.delegates.map(function(d) { d.syntaxError(recognizer, offendingSymbol, line, column, msg, e); });
};

ProxyErrorListener.prototype.reportAmbiguity = function(recognizer, dfa, startIndex, stopIndex, exact, ambigAlts, configs) {
    this.delegates.map(function(d) { d.reportAmbiguity(recognizer, dfa, startIndex, stopIndex, exact, ambigAlts, configs); });
};

ProxyErrorListener.prototype.reportAttemptingFullContext = function(recognizer, dfa, startIndex, stopIndex, conflictingAlts, configs) {
	this.delegates.map(function(d) { d.reportAttemptingFullContext(recognizer, dfa, startIndex, stopIndex, conflictingAlts, configs); });
};

ProxyErrorListener.prototype.reportContextSensitivity = function(recognizer, dfa, startIndex, stopIndex, prediction, configs) {
	this.delegates.map(function(d) { d.reportContextSensitivity(recognizer, dfa, startIndex, stopIndex, prediction, configs); });
};

exports.ErrorListener = ErrorListener;
exports.ConsoleErrorListener = ConsoleErrorListener;
exports.ProxyErrorListener = ProxyErrorListener;
});

define("ace/mode/cql/antlr4/error/DiagnosticErrorListener",["require","exports","module","ace/mode/cql/antlr4/Utils","ace/mode/cql/antlr4/error/ErrorListener","ace/mode/cql/antlr4/IntervalSet"], function(require, exports, module) {

var BitSet = require('./../Utils').BitSet;
var ErrorListener = require('./ErrorListener').ErrorListener;
var Interval = require('./../IntervalSet').Interval;

function DiagnosticErrorListener(exactOnly) {
	ErrorListener.call(this);
	exactOnly = exactOnly || true;
	this.exactOnly = exactOnly;
	return this;
}

DiagnosticErrorListener.prototype = Object.create(ErrorListener.prototype);
DiagnosticErrorListener.prototype.constructor = DiagnosticErrorListener;

DiagnosticErrorListener.prototype.reportAmbiguity = function(recognizer, dfa,
		startIndex, stopIndex, exact, ambigAlts, configs) {
	if (this.exactOnly && !exact) {
		return;
	}
	var msg = "reportAmbiguity d=" +
			this.getDecisionDescription(recognizer, dfa) +
			": ambigAlts=" +
			this.getConflictingAlts(ambigAlts, configs) +
			", input='" +
			recognizer.getTokenStream().getText(new Interval(startIndex, stopIndex)) + "'";
	recognizer.notifyErrorListeners(msg);
};

DiagnosticErrorListener.prototype.reportAttemptingFullContext = function(
		recognizer, dfa, startIndex, stopIndex, conflictingAlts, configs) {
	var msg = "reportAttemptingFullContext d=" +
			this.getDecisionDescription(recognizer, dfa) +
			", input='" +
			recognizer.getTokenStream().getText(new Interval(startIndex, stopIndex)) + "'";
	recognizer.notifyErrorListeners(msg);
};

DiagnosticErrorListener.prototype.reportContextSensitivity = function(
		recognizer, dfa, startIndex, stopIndex, prediction, configs) {
	var msg = "reportContextSensitivity d=" +
			this.getDecisionDescription(recognizer, dfa) +
			", input='" +
			recognizer.getTokenStream().getText(new Interval(startIndex, stopIndex)) + "'";
	recognizer.notifyErrorListeners(msg);
};

DiagnosticErrorListener.prototype.getDecisionDescription = function(recognizer, dfa) {
	var decision = dfa.decision;
	var ruleIndex = dfa.atnStartState.ruleIndex;

	var ruleNames = recognizer.ruleNames;
	if (ruleIndex < 0 || ruleIndex >= ruleNames.length) {
		return "" + decision;
	}
	var ruleName = ruleNames[ruleIndex] || null;
	if (ruleName === null || ruleName.length === 0) {
		return "" + decision;
	}
	return "" + decision + " (" + ruleName + ")";
};
DiagnosticErrorListener.prototype.getConflictingAlts = function(reportedAlts, configs) {
	if (reportedAlts !== null) {
		return reportedAlts;
	}
	var result = new BitSet();
	for (var i = 0; i < configs.items.length; i++) {
		result.add(configs.items[i].alt);
	}
	return "{" + result.values().join(", ") + "}";
};

exports.DiagnosticErrorListener = DiagnosticErrorListener;
});

define("ace/mode/cql/antlr4/atn/ATNState",["require","exports","module"], function(require, exports, module) {

var INITIAL_NUM_TRANSITIONS = 4;

function ATNState() {
    this.atn = null;
    this.stateNumber = ATNState.INVALID_STATE_NUMBER;
    this.stateType = null;
    this.ruleIndex = 0; // at runtime, we don't have Rule objects
    this.epsilonOnlyTransitions = false;
    this.transitions = [];
    this.nextTokenWithinRule = null;
    return this;
}
ATNState.INVALID_TYPE = 0;
ATNState.BASIC = 1;
ATNState.RULE_START = 2;
ATNState.BLOCK_START = 3;
ATNState.PLUS_BLOCK_START = 4;
ATNState.STAR_BLOCK_START = 5;
ATNState.TOKEN_START = 6;
ATNState.RULE_STOP = 7;
ATNState.BLOCK_END = 8;
ATNState.STAR_LOOP_BACK = 9;
ATNState.STAR_LOOP_ENTRY = 10;
ATNState.PLUS_LOOP_BACK = 11;
ATNState.LOOP_END = 12;

ATNState.serializationNames = [
            "INVALID",
            "BASIC",
            "RULE_START",
            "BLOCK_START",
            "PLUS_BLOCK_START",
            "STAR_BLOCK_START",
            "TOKEN_START",
            "RULE_STOP",
            "BLOCK_END",
            "STAR_LOOP_BACK",
            "STAR_LOOP_ENTRY",
            "PLUS_LOOP_BACK",
            "LOOP_END" ];

ATNState.INVALID_STATE_NUMBER = -1;

ATNState.prototype.toString = function() {
	return this.stateNumber;
};

ATNState.prototype.equals = function(other) {
    if (other instanceof ATNState) {
        return this.stateNumber===other.stateNumber;
    } else {
        return false;
    }
};

ATNState.prototype.isNonGreedyExitState = function() {
    return false;
};


ATNState.prototype.addTransition = function(trans, index) {
	if(index===undefined) {
		index = -1;
	}
    if (this.transitions.length===0) {
        this.epsilonOnlyTransitions = trans.isEpsilon;
    } else if(this.epsilonOnlyTransitions !== trans.isEpsilon) {
        this.epsilonOnlyTransitions = false;
    }
    if (index===-1) {
        this.transitions.push(trans);
    } else {
        this.transitions.splice(index, 1, trans);
    }
};

function BasicState() {
	ATNState.call(this);
    this.stateType = ATNState.BASIC;
    return this;
}

BasicState.prototype = Object.create(ATNState.prototype);
BasicState.prototype.constructor = BasicState;


function DecisionState() {
	ATNState.call(this);
    this.decision = -1;
    this.nonGreedy = false;
    return this;
}

DecisionState.prototype = Object.create(ATNState.prototype);
DecisionState.prototype.constructor = DecisionState;
function BlockStartState() {
	DecisionState.call(this);
	this.endState = null;
	return this;
}

BlockStartState.prototype = Object.create(DecisionState.prototype);
BlockStartState.prototype.constructor = BlockStartState;


function BasicBlockStartState() {
	BlockStartState.call(this);
	this.stateType = ATNState.BLOCK_START;
	return this;
}

BasicBlockStartState.prototype = Object.create(BlockStartState.prototype);
BasicBlockStartState.prototype.constructor = BasicBlockStartState;
function BlockEndState() {
	ATNState.call(this);
	this.stateType = ATNState.BLOCK_END;
    this.startState = null;
    return this;
}

BlockEndState.prototype = Object.create(ATNState.prototype);
BlockEndState.prototype.constructor = BlockEndState;
function RuleStopState() {
	ATNState.call(this);
    this.stateType = ATNState.RULE_STOP;
    return this;
}

RuleStopState.prototype = Object.create(ATNState.prototype);
RuleStopState.prototype.constructor = RuleStopState;

function RuleStartState() {
	ATNState.call(this);
	this.stateType = ATNState.RULE_START;
	this.stopState = null;
	this.isPrecedenceRule = false;
	return this;
}

RuleStartState.prototype = Object.create(ATNState.prototype);
RuleStartState.prototype.constructor = RuleStartState;
function PlusLoopbackState() {
	DecisionState.call(this);
	this.stateType = ATNState.PLUS_LOOP_BACK;
	return this;
}

PlusLoopbackState.prototype = Object.create(DecisionState.prototype);
PlusLoopbackState.prototype.constructor = PlusLoopbackState;
function PlusBlockStartState() {
	BlockStartState.call(this);
	this.stateType = ATNState.PLUS_BLOCK_START;
    this.loopBackState = null;
    return this;
}

PlusBlockStartState.prototype = Object.create(BlockStartState.prototype);
PlusBlockStartState.prototype.constructor = PlusBlockStartState;
function StarBlockStartState() {
	BlockStartState.call(this);
	this.stateType = ATNState.STAR_BLOCK_START;
	return this;
}

StarBlockStartState.prototype = Object.create(BlockStartState.prototype);
StarBlockStartState.prototype.constructor = StarBlockStartState;


function StarLoopbackState() {
	ATNState.call(this);
	this.stateType = ATNState.STAR_LOOP_BACK;
	return this;
}

StarLoopbackState.prototype = Object.create(ATNState.prototype);
StarLoopbackState.prototype.constructor = StarLoopbackState;


function StarLoopEntryState() {
	DecisionState.call(this);
	this.stateType = ATNState.STAR_LOOP_ENTRY;
    this.loopBackState = null;
    this.precedenceRuleDecision = null;
    return this;
}

StarLoopEntryState.prototype = Object.create(DecisionState.prototype);
StarLoopEntryState.prototype.constructor = StarLoopEntryState;
function LoopEndState() {
	ATNState.call(this);
	this.stateType = ATNState.LOOP_END;
	this.loopBackState = null;
	return this;
}

LoopEndState.prototype = Object.create(ATNState.prototype);
LoopEndState.prototype.constructor = LoopEndState;
function TokensStartState() {
	DecisionState.call(this);
	this.stateType = ATNState.TOKEN_START;
	return this;
}

TokensStartState.prototype = Object.create(DecisionState.prototype);
TokensStartState.prototype.constructor = TokensStartState;

exports.ATNState = ATNState;
exports.BasicState = BasicState;
exports.DecisionState = DecisionState;
exports.BlockStartState = BlockStartState;
exports.BlockEndState = BlockEndState;
exports.LoopEndState = LoopEndState;
exports.RuleStartState = RuleStartState;
exports.RuleStopState = RuleStopState;
exports.TokensStartState = TokensStartState;
exports.PlusLoopbackState = PlusLoopbackState;
exports.StarLoopbackState = StarLoopbackState;
exports.StarLoopEntryState = StarLoopEntryState;
exports.PlusBlockStartState = PlusBlockStartState;
exports.StarBlockStartState = StarBlockStartState;
exports.BasicBlockStartState = BasicBlockStartState;
});

define("ace/mode/cql/antlr4/error/ErrorStrategy",["require","exports","module","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/error/Errors","ace/mode/cql/antlr4/atn/ATNState","ace/mode/cql/antlr4/IntervalSet","ace/mode/cql/antlr4/IntervalSet"], function(require, exports, module) {

var Token = require('./../Token').Token;
var Errors = require('./Errors');
var NoViableAltException = Errors.NoViableAltException;
var InputMismatchException = Errors.InputMismatchException;
var FailedPredicateException = Errors.FailedPredicateException;
var ParseCancellationException = Errors.ParseCancellationException;
var ATNState = require('./../atn/ATNState').ATNState;
var Interval = require('./../IntervalSet').Interval;
var IntervalSet = require('./../IntervalSet').IntervalSet;

function ErrorStrategy() {
	
}

ErrorStrategy.prototype.reset = function(recognizer){
};

ErrorStrategy.prototype.recoverInline = function(recognizer){
};

ErrorStrategy.prototype.recover = function(recognizer, e){
};

ErrorStrategy.prototype.sync = function(recognizer){
};

ErrorStrategy.prototype.inErrorRecoveryMode = function(recognizer){
};

ErrorStrategy.prototype.reportError = function(recognizer){
};
function DefaultErrorStrategy() {
	ErrorStrategy.call(this);
    this.errorRecoveryMode = false;
    this.lastErrorIndex = -1;
    this.lastErrorStates = null;
    return this;
}

DefaultErrorStrategy.prototype = Object.create(ErrorStrategy.prototype);
DefaultErrorStrategy.prototype.constructor = DefaultErrorStrategy;
DefaultErrorStrategy.prototype.reset = function(recognizer) {
    this.endErrorCondition(recognizer);
};
DefaultErrorStrategy.prototype.beginErrorCondition = function(recognizer) {
    this.errorRecoveryMode = true;
};

DefaultErrorStrategy.prototype.inErrorRecoveryMode = function(recognizer) {
    return this.errorRecoveryMode;
};
DefaultErrorStrategy.prototype.endErrorCondition = function(recognizer) {
    this.errorRecoveryMode = false;
    this.lastErrorStates = null;
    this.lastErrorIndex = -1;
};
DefaultErrorStrategy.prototype.reportMatch = function(recognizer) {
    this.endErrorCondition(recognizer);
};
DefaultErrorStrategy.prototype.reportError = function(recognizer, e) {
    if(this.inErrorRecoveryMode(recognizer)) {
        return; // don't report spurious errors
    }
    this.beginErrorCondition(recognizer);
    if ( e instanceof NoViableAltException ) {
        this.reportNoViableAlternative(recognizer, e);
    } else if ( e instanceof InputMismatchException ) {
        this.reportInputMismatch(recognizer, e);
    } else if ( e instanceof FailedPredicateException ) {
        this.reportFailedPredicate(recognizer, e);
    } else {
        console.log("unknown recognition error type: " + e.constructor.name);
        console.log(e.stack);
        recognizer.notifyErrorListeners(e.getOffendingToken(), e.getMessage(), e);
    }
};
DefaultErrorStrategy.prototype.recover = function(recognizer, e) {
    if (this.lastErrorIndex===recognizer.getInputStream().index &&
        this.lastErrorStates !== null && this.lastErrorStates.indexOf(recognizer.state)>=0) {
		recognizer.consume();
    }
    this.lastErrorIndex = recognizer._input.index;
    if (this.lastErrorStates === null) {
        this.lastErrorStates = [];
    }
    this.lastErrorStates.push(recognizer.state);
    var followSet = this.getErrorRecoverySet(recognizer);
    this.consumeUntil(recognizer, followSet);
};
DefaultErrorStrategy.prototype.sync = function(recognizer) {
    if (this.inErrorRecoveryMode(recognizer)) {
        return;
    }
    var s = recognizer._interp.atn.states[recognizer.state];
    var la = recognizer.getTokenStream().LA(1);
    if (la===Token.EOF || recognizer.atn.nextTokens(s).contains(la)) {
        return;
    }
    if(recognizer.isExpectedToken(la)) {
        return;
    }
    switch (s.stateType) {
    case ATNState.BLOCK_START:
    case ATNState.STAR_BLOCK_START:
    case ATNState.PLUS_BLOCK_START:
    case ATNState.STAR_LOOP_ENTRY:
        if( this.singleTokenDeletion(recognizer) !== null) {
            return;
        } else {
            throw new InputMismatchException(recognizer);
        }
        break;
    case ATNState.PLUS_LOOP_BACK:
    case ATNState.STAR_LOOP_BACK:
        this.reportUnwantedToken(recognizer);
        var expecting = recognizer.getExpectedTokens();
        var whatFollowsLoopIterationOrRule = expecting.addSet(this.getErrorRecoverySet(recognizer));
        this.consumeUntil(recognizer, whatFollowsLoopIterationOrRule);
        break;
    default:
    }
};
DefaultErrorStrategy.prototype.reportNoViableAlternative = function(recognizer, e) {
    var tokens = recognizer.getTokenStream();
    var input;
    if(tokens !== null) {
        if (e.startToken.type===Token.EOF) {
            input = "<EOF>";
        } else {
            input = tokens.getText(new Interval(e.startToken, e.offendingToken));
        }
    } else {
        input = "<unknown input>";
    }
    var msg = "no viable alternative at input " + this.escapeWSAndQuote(input);
    recognizer.notifyErrorListeners(msg, e.offendingToken, e);
};
DefaultErrorStrategy.prototype.reportInputMismatch = function(recognizer, e) {
    var msg = "mismatched input " + this.getTokenErrorDisplay(e.offendingToken) +
          " expecting " + e.getExpectedTokens().toString(recognizer.literalNames, recognizer.symbolicNames);
    recognizer.notifyErrorListeners(msg, e.offendingToken, e);
};
DefaultErrorStrategy.prototype.reportFailedPredicate = function(recognizer, e) {
    var ruleName = recognizer.ruleNames[recognizer._ctx.ruleIndex];
    var msg = "rule " + ruleName + " " + e.message;
    recognizer.notifyErrorListeners(msg, e.offendingToken, e);
};
DefaultErrorStrategy.prototype.reportUnwantedToken = function(recognizer) {
    if (this.inErrorRecoveryMode(recognizer)) {
        return;
    }
    this.beginErrorCondition(recognizer);
    var t = recognizer.getCurrentToken();
    var tokenName = this.getTokenErrorDisplay(t);
    var expecting = this.getExpectedTokens(recognizer);
    var msg = "extraneous input " + tokenName + " expecting " +
        expecting.toString(recognizer.literalNames, recognizer.symbolicNames);
    recognizer.notifyErrorListeners(msg, t, null);
};
DefaultErrorStrategy.prototype.reportMissingToken = function(recognizer) {
    if ( this.inErrorRecoveryMode(recognizer)) {
        return;
    }
    this.beginErrorCondition(recognizer);
    var t = recognizer.getCurrentToken();
    var expecting = this.getExpectedTokens(recognizer);
    var msg = "missing " + expecting.toString(recognizer.literalNames, recognizer.symbolicNames) +
          " at " + this.getTokenErrorDisplay(t);
    recognizer.notifyErrorListeners(msg, t, null);
};
DefaultErrorStrategy.prototype.recoverInline = function(recognizer) {
    var matchedSymbol = this.singleTokenDeletion(recognizer);
    if (matchedSymbol !== null) {
        recognizer.consume();
        return matchedSymbol;
    }
    if (this.singleTokenInsertion(recognizer)) {
        return this.getMissingSymbol(recognizer);
    }
    throw new InputMismatchException(recognizer);
};
DefaultErrorStrategy.prototype.singleTokenInsertion = function(recognizer) {
    var currentSymbolType = recognizer.getTokenStream().LA(1);
    var atn = recognizer._interp.atn;
    var currentState = atn.states[recognizer.state];
    var next = currentState.transitions[0].target;
    var expectingAtLL2 = atn.nextTokens(next, recognizer._ctx);
    if (expectingAtLL2.contains(currentSymbolType) ){
        this.reportMissingToken(recognizer);
        return true;
    } else {
        return false;
    }
};
DefaultErrorStrategy.prototype.singleTokenDeletion = function(recognizer) {
    var nextTokenType = recognizer.getTokenStream().LA(2);
    var expecting = this.getExpectedTokens(recognizer);
    if (expecting.contains(nextTokenType)) {
        this.reportUnwantedToken(recognizer);
        recognizer.consume(); // simply delete extra token
        var matchedSymbol = recognizer.getCurrentToken();
        this.reportMatch(recognizer); // we know current token is correct
        return matchedSymbol;
    } else {
        return null;
    }
};
DefaultErrorStrategy.prototype.getMissingSymbol = function(recognizer) {
    var currentSymbol = recognizer.getCurrentToken();
    var expecting = this.getExpectedTokens(recognizer);
    var expectedTokenType = expecting.first(); // get any element
    var tokenText;
    if (expectedTokenType===Token.EOF) {
        tokenText = "<missing EOF>";
    } else {
        tokenText = "<missing " + recognizer.literalNames[expectedTokenType] + ">";
    }
    var current = currentSymbol;
    var lookback = recognizer.getTokenStream().LT(-1);
    if (current.type===Token.EOF && lookback !== null) {
        current = lookback;
    }
    return recognizer.getTokenFactory().create(current.source,
        expectedTokenType, tokenText, Token.DEFAULT_CHANNEL,
        -1, -1, current.line, current.column);
};

DefaultErrorStrategy.prototype.getExpectedTokens = function(recognizer) {
    return recognizer.getExpectedTokens();
};
DefaultErrorStrategy.prototype.getTokenErrorDisplay = function(t) {
    if (t === null) {
        return "<no token>";
    }
    var s = t.text;
    if (s === null) {
        if (t.type===Token.EOF) {
            s = "<EOF>";
        } else {
            s = "<" + t.type + ">";
        }
    }
    return this.escapeWSAndQuote(s);
};

DefaultErrorStrategy.prototype.escapeWSAndQuote = function(s) {
    s = s.replace(/\n/g,"\\n");
    s = s.replace(/\r/g,"\\r");
    s = s.replace(/\t/g,"\\t");
    return "'" + s + "'";
};
DefaultErrorStrategy.prototype.getErrorRecoverySet = function(recognizer) {
    var atn = recognizer._interp.atn;
    var ctx = recognizer._ctx;
    var recoverSet = new IntervalSet();
    while (ctx !== null && ctx.invokingState>=0) {
        var invokingState = atn.states[ctx.invokingState];
        var rt = invokingState.transitions[0];
        var follow = atn.nextTokens(rt.followState);
        recoverSet.addSet(follow);
        ctx = ctx.parentCtx;
    }
    recoverSet.removeOne(Token.EPSILON);
    return recoverSet;
};
DefaultErrorStrategy.prototype.consumeUntil = function(recognizer, set) {
    var ttype = recognizer.getTokenStream().LA(1);
    while( ttype !== Token.EOF && !set.contains(ttype)) {
        recognizer.consume();
        ttype = recognizer.getTokenStream().LA(1);
    }
};
function BailErrorStrategy() {
	DefaultErrorStrategy.call(this);
	return this;
}

BailErrorStrategy.prototype = Object.create(DefaultErrorStrategy.prototype);
BailErrorStrategy.prototype.constructor = BailErrorStrategy;
BailErrorStrategy.prototype.recover = function(recognizer, e) {
    var context = recognizer._ctx;
    while (context !== null) {
        context.exception = e;
        context = context.parentCtx;
    }
    throw new ParseCancellationException(e);
};
BailErrorStrategy.prototype.recoverInline = function(recognizer) {
    this.recover(recognizer, new InputMismatchException(recognizer));
};
BailErrorStrategy.prototype.sync = function(recognizer) {
};

exports.BailErrorStrategy = BailErrorStrategy;
exports.DefaultErrorStrategy = DefaultErrorStrategy;
});

define("ace/mode/cql/antlr4/error/index",["require","exports","module","ace/mode/cql/antlr4/error/Errors","ace/mode/cql/antlr4/error/Errors","ace/mode/cql/antlr4/error/Errors","ace/mode/cql/antlr4/error/Errors","ace/mode/cql/antlr4/error/Errors","ace/mode/cql/antlr4/error/DiagnosticErrorListener","ace/mode/cql/antlr4/error/ErrorStrategy","ace/mode/cql/antlr4/error/ErrorListener"], function(require, exports, module) {
  exports.RecognitionException = require('./Errors').RecognitionException;
exports.NoViableAltException = require('./Errors').NoViableAltException;
exports.LexerNoViableAltException = require('./Errors').LexerNoViableAltException;
exports.InputMismatchException = require('./Errors').InputMismatchException;
exports.FailedPredicateException = require('./Errors').FailedPredicateException;
exports.DiagnosticErrorListener = require('./DiagnosticErrorListener').DiagnosticErrorListener;
exports.BailErrorStrategy = require('./ErrorStrategy').BailErrorStrategy;
exports.ErrorListener = require('./ErrorListener').ErrorListener;
});

define("ace/mode/cql/antlr4/tree/Trees",["require","exports","module","ace/mode/cql/antlr4/Utils","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/tree/Tree","ace/mode/cql/antlr4/tree/Tree","ace/mode/cql/antlr4/tree/Tree","ace/mode/cql/antlr4/ParserRuleContext"], function(require, exports, module) {

var Utils = require('./../Utils');
var Token = require('./../Token').Token;
var RuleNode = require('./Tree').RuleNode;
var ErrorNode = require('./Tree').ErrorNode;
var TerminalNode = require('./Tree').TerminalNode;
var ParserRuleContext = require('./../ParserRuleContext').ParserRuleContext;
function Trees() {
}
Trees.toStringTree = function(tree, ruleNames, recog) {
	ruleNames = ruleNames || null;
	recog = recog || null;
    if(recog!==null) {
       ruleNames = recog.ruleNames;
    }
    var s = Trees.getNodeText(tree, ruleNames);
    s = Utils.escapeWhitespace(s, false);
    var c = tree.getChildCount();
    if(c===0) {
        return s;
    }
    var res = "(" + s + ' ';
    if(c>0) {
        s = Trees.toStringTree(tree.getChild(0), ruleNames);
        res = res.concat(s);
    }
    for(var i=1;i<c;i++) {
        s = Trees.toStringTree(tree.getChild(i), ruleNames);
        res = res.concat(' ' + s);
    }
    res = res.concat(")");
    return res;
};

Trees.getNodeText = function(t, ruleNames, recog) {
	ruleNames = ruleNames || null;
	recog = recog || null;
    if(recog!==null) {
        ruleNames = recog.ruleNames;
    }
    if(ruleNames!==null) {
       if (t instanceof RuleNode) {
           return ruleNames[t.getRuleContext().ruleIndex];
       } else if ( t instanceof ErrorNode) {
           return t.toString();
       } else if(t instanceof TerminalNode) {
           if(t.symbol!==null) {
               return t.symbol.text;
           }
       }
    }
    var payload = t.getPayload();
    if (payload instanceof Token ) {
       return payload.text;
    }
    return t.getPayload().toString();
};
Trees.getChildren = function(t) {
	var list = [];
	for(var i=0;i<t.getChildCount();i++) {
		list.push(t.getChild(i));
	}
	return list;
};
Trees.getAncestors = function(t) {
    var ancestors = [];
    t = t.getParent();
    while(t!==null) {
        ancestors = [t].concat(ancestors);
        t = t.getParent();
    }
    return ancestors;
};
   
Trees.findAllTokenNodes = function(t, ttype) {
    return Trees.findAllNodes(t, ttype, true);
};

Trees.findAllRuleNodes = function(t, ruleIndex) {
	return Trees.findAllNodes(t, ruleIndex, false);
};

Trees.findAllNodes = function(t, index, findTokens) {
	var nodes = [];
	Trees._findAllNodes(t, index, findTokens, nodes);
	return nodes;
};

Trees._findAllNodes = function(t, index, findTokens, nodes) {
	if(findTokens && (t instanceof TerminalNode)) {
		if(t.symbol.type===index) {
			nodes.push(t);
		}
	} else if(!findTokens && (t instanceof ParserRuleContext)) {
		if(t.ruleIndex===index) {
			nodes.push(t);
		}
	}
	for(var i=0;i<t.getChildCount();i++) {
		Trees._findAllNodes(t.getChild(i), index, findTokens, nodes);
	}
};

Trees.descendants = function(t) {
	var nodes = [t];
    for(var i=0;i<t.getChildCount();i++) {
        nodes = nodes.concat(Trees.descendants(t.getChild(i)));
    }
    return nodes;
};


exports.Trees = Trees;
});

define("ace/mode/cql/antlr4/RuleContext",["require","exports","module","ace/mode/cql/antlr4/tree/Tree","ace/mode/cql/antlr4/tree/Tree","ace/mode/cql/antlr4/tree/Trees"], function(require, exports, module) {

var RuleNode = require('./tree/Tree').RuleNode;
var INVALID_INTERVAL = require('./tree/Tree').INVALID_INTERVAL;

function RuleContext(parent, invokingState) {
	RuleNode.call(this);
	this.parentCtx = parent || null;
	this.invokingState = invokingState || -1;
	return this;
}

RuleContext.prototype = Object.create(RuleNode.prototype);
RuleContext.prototype.constructor = RuleContext;

RuleContext.prototype.depth = function() {
	var n = 0;
	var p = this;
	while (p !== null) {
		p = p.parentCtx;
		n += 1;
	}
	return n;
};
RuleContext.prototype.isEmpty = function() {
	return this.invokingState === -1;
};

RuleContext.prototype.getSourceInterval = function() {
	return INVALID_INTERVAL;
};

RuleContext.prototype.getRuleContext = function() {
	return this;
};

RuleContext.prototype.getPayload = function() {
	return this;
};
RuleContext.prototype.getText = function() {
	if (this.getChildCount() === 0) {
		return "";
	} else {
		return this.children.map(function(child) {
			return child.getText();
		}).join("");
	}
};

RuleContext.prototype.getChild = function(i) {
	return null;
};

RuleContext.prototype.getChildCount = function() {
	return 0;
};

RuleContext.prototype.accept = function(visitor) {
	return visitor.visitChildren(this);
};
exports.RuleContext = RuleContext;
var Trees = require('./tree/Trees').Trees;

RuleContext.prototype.toStringTree = function(ruleNames, recog) {
	return Trees.toStringTree(this, ruleNames, recog);
};

RuleContext.prototype.toString = function(ruleNames, stop) {
	ruleNames = ruleNames || null;
	stop = stop || null;
	var p = this;
	var s = "[";
	while (p !== null && p !== stop) {
		if (ruleNames === null) {
			if (!p.isEmpty()) {
				s += p.invokingState;
			}
		} else {
			var ri = p.ruleIndex;
			var ruleName = (ri >= 0 && ri < ruleNames.length) ? ruleNames[ri]
					: "" + ri;
			s += ruleName;
		}
		if (p.parentCtx !== null && (ruleNames !== null || !p.parentCtx.isEmpty())) {
			s += " ";
		}
		p = p.parentCtx;
	}
	s += "]";
	return s;
};
});

define("ace/mode/cql/antlr4/ParserRuleContext",["require","exports","module","ace/mode/cql/antlr4/RuleContext","ace/mode/cql/antlr4/tree/Tree"], function(require, exports, module) {

var RuleContext = require('./RuleContext').RuleContext;
var Tree = require('./tree/Tree');
var INVALID_INTERVAL = Tree.INVALID_INTERVAL;
var TerminalNode = Tree.TerminalNode;
var TerminalNodeImpl = Tree.TerminalNodeImpl;
var ErrorNodeImpl = Tree.ErrorNodeImpl;

function ParserRuleContext(parent, invokingStateNumber) {
	parent = parent || null;
	invokingStateNumber = invokingStateNumber || null;
	RuleContext.call(this, parent, invokingStateNumber);
	this.ruleIndex = -1;
    this.children = null;
    this.start = null;
    this.stop = null;
    this.exception = null;
}

ParserRuleContext.prototype = Object.create(RuleContext.prototype);
ParserRuleContext.prototype.constructor = ParserRuleContext;
ParserRuleContext.prototype.copyFrom = function(ctx) {
    this.parentCtx = ctx.parentCtx;
    this.invokingState = ctx.invokingState;
    this.children = null;
    this.start = ctx.start;
    this.stop = ctx.stop;
};
ParserRuleContext.prototype.enterRule = function(listener) {
};

ParserRuleContext.prototype.exitRule = function(listener) {
};
ParserRuleContext.prototype.addChild = function(child) {
    if (this.children === null) {
        this.children = [];
    }
    this.children.push(child);
    return child;
};
ParserRuleContext.prototype.removeLastChild = function() {
    if (this.children !== null) {
        this.children.pop();
    }
};

ParserRuleContext.prototype.addTokenNode = function(token) {
    var node = new TerminalNodeImpl(token);
    this.addChild(node);
    node.parentCtx = this;
    return node;
};

ParserRuleContext.prototype.addErrorNode = function(badToken) {
    var node = new ErrorNodeImpl(badToken);
    this.addChild(node);
    node.parentCtx = this;
    return node;
};

ParserRuleContext.prototype.getChild = function(i, type) {
	type = type || null;
	if (type === null) {
		return this.children.length>=i ? this.children[i] : null;
	} else {
		for(var j=0; j<this.children.length; j++) {
			var child = this.children[j];
			if(child instanceof type) {
				if(i===0) {
					return child;
				} else {
					i -= 1;
				}
			}
		}
		return null;
    }
};


ParserRuleContext.prototype.getToken = function(ttype, i) {
	for(var j=0; j<this.children.length; j++) {
		var child = this.children[j];
		if (child instanceof TerminalNode) {
			if (child.symbol.type === ttype) {
				if(i===0) {
					return child;
				} else {
					i -= 1;
				}
			}
        }
	}
    return null;
};

ParserRuleContext.prototype.getTokens = function(ttype ) {
    if (this.children=== null) {
        return [];
    } else {
		var tokens = [];
		for(var j=0; j<this.children.length; j++) {
			var child = this.children[j];
			if (child instanceof TerminalNode) {
				if (child.symbol.type === ttype) {
					tokens.push(child);
				}
			}
		}
		return tokens;
    }
};

ParserRuleContext.prototype.getTypedRuleContext = function(ctxType, i) {
    return this.getChild(i, ctxType);
};

ParserRuleContext.prototype.getTypedRuleContexts = function(ctxType) {
    if (this.children=== null) {
        return [];
    } else {
		var contexts = [];
		for(var j=0; j<this.children.length; j++) {
			var child = this.children[j];
			if (child instanceof ctxType) {
				contexts.push(child);
			}
		}
		return contexts;
	}
};

ParserRuleContext.prototype.getChildCount = function() {
	if (this.children=== null) {
		return 0;
	} else {
		return this.children.length;
	}
};

ParserRuleContext.prototype.getSourceInterval = function() {
    if( this.start === null || this.stop === null) {
        return INVALID_INTERVAL;
    } else {
        return (this.start.tokenIndex, this.stop.tokenIndex);
    }
};

RuleContext.EMPTY = new ParserRuleContext();

function InterpreterRuleContext(parent, invokingStateNumber, ruleIndex) {
	ParserRuleContext.call(parent, invokingStateNumber);
    this.ruleIndex = ruleIndex;
    return this;
}

InterpreterRuleContext.prototype = Object.create(ParserRuleContext.prototype);
InterpreterRuleContext.prototype.constructor = InterpreterRuleContext;

exports.ParserRuleContext = ParserRuleContext;
});

define("ace/mode/cql/antlr4/atn/ATNConfig",["require","exports","module","ace/mode/cql/antlr4/atn/ATNState","ace/mode/cql/antlr4/atn/SemanticContext"], function(require, exports, module) {

var DecisionState = require('./ATNState').DecisionState;
var SemanticContext = require('./SemanticContext').SemanticContext;

function checkParams(params, isCfg) {
	if(params===null) {
		var result = { state:null, alt:null, context:null, semanticContext:null };
		if(isCfg) {
			result.reachesIntoOuterContext = 0;
		}
		return result;
	} else {
		var props = {};
		props.state = params.state || null;
		props.alt = params.alt || null;
		props.context = params.context || null;
		props.semanticContext = params.semanticContext || null;
		if(isCfg) {
			props.reachesIntoOuterContext = params.reachesIntoOuterContext || 0;
			props.precedenceFilterSuppressed = params.precedenceFilterSuppressed || false;
		}
		return props;
	}
}

function ATNConfig(params, config) {
	this.checkContext(params, config);
	params = checkParams(params);
	config = checkParams(config, true);
    this.state = params.state!==null ? params.state : config.state;
    this.alt = params.alt!==null ? params.alt : config.alt;
    this.context = params.context!==null ? params.context : config.context;
    this.semanticContext = params.semanticContext!==null ? params.semanticContext :
        (config.semanticContext!==null ? config.semanticContext : SemanticContext.NONE);
    this.reachesIntoOuterContext = config.reachesIntoOuterContext;
    this.precedenceFilterSuppressed = config.precedenceFilterSuppressed;
    return this;
}

ATNConfig.prototype.checkContext = function(params, config) {
	if((params.context===null || params.context===undefined) &&
			(config===null || config.context===null || config.context===undefined)) {
		this.context = null;
	}
};
ATNConfig.prototype.equals = function(other) {
    if (this === other) {
        return true;
    } else if (! (other instanceof ATNConfig)) {
        return false;
    } else {
        return this.state.stateNumber===other.state.stateNumber &&
            this.alt===other.alt &&
            (this.context===null ? other.context===null : this.context.equals(other.context)) &&
            this.semanticContext.equals(other.semanticContext) &&
            this.precedenceFilterSuppressed===other.precedenceFilterSuppressed;
    }
};

ATNConfig.prototype.shortHashString = function() {
    return "" + this.state.stateNumber + "/" + this.alt + "/" + this.semanticContext;
};

ATNConfig.prototype.hashString = function() {
    return "" + this.state.stateNumber + "/" + this.alt + "/" +
             (this.context===null ? "" : this.context.hashString()) +
             "/" + this.semanticContext.hashString();
};

ATNConfig.prototype.toString = function() {
    return "(" + this.state + "," + this.alt +
        (this.context!==null ? ",[" + this.context.toString() + "]" : "") +
        (this.semanticContext !== SemanticContext.NONE ?
                ("," + this.semanticContext.toString())
                : "") +
        (this.reachesIntoOuterContext>0 ?
                (",up=" + this.reachesIntoOuterContext)
                : "") + ")";
};


function LexerATNConfig(params, config) {
	ATNConfig.call(this, params, config);
	var lexerActionExecutor = params.lexerActionExecutor || null;
    this.lexerActionExecutor = lexerActionExecutor || (config!==null ? config.lexerActionExecutor : null);
    this.passedThroughNonGreedyDecision = config!==null ? this.checkNonGreedyDecision(config, this.state) : false;
    return this;
}

LexerATNConfig.prototype = Object.create(ATNConfig.prototype);
LexerATNConfig.prototype.constructor = LexerATNConfig;

LexerATNConfig.prototype.hashString = function() {
    return "" + this.state.stateNumber + this.alt + this.context +
            this.semanticContext + (this.passedThroughNonGreedyDecision ? 1 : 0) +
            this.lexerActionExecutor;
};

LexerATNConfig.prototype.equals = function(other) {
    if (this === other) {
        return true;
    } else if (!(other instanceof LexerATNConfig)) {
        return false;
    } else if (this.passedThroughNonGreedyDecision !== other.passedThroughNonGreedyDecision) {
        return false;
    } else if (this.lexerActionExecutor !== other.lexerActionExecutor) {
        return false;
    } else {
        return ATNConfig.prototype.equals.call(this, other);
    }
};

LexerATNConfig.prototype.checkNonGreedyDecision = function(source, target) {
    return source.passedThroughNonGreedyDecision ||
        (target instanceof DecisionState) && target.nonGreedy;
};

exports.ATNConfig = ATNConfig;
exports.LexerATNConfig = LexerATNConfig;
});

define("ace/mode/cql/antlr4/PredictionContext",["require","exports","module","ace/mode/cql/antlr4/RuleContext"], function(require, exports, module) {

var RuleContext = require('./RuleContext').RuleContext;

function PredictionContext(cachedHashString) {
	this.cachedHashString = cachedHashString;
}
PredictionContext.EMPTY = null;
PredictionContext.EMPTY_RETURN_STATE = 0x7FFFFFFF;

PredictionContext.globalNodeCount = 1;
PredictionContext.id = PredictionContext.globalNodeCount;
PredictionContext.prototype.isEmpty = function() {
	return this === PredictionContext.EMPTY;
};

PredictionContext.prototype.hasEmptyPath = function() {
	return this.getReturnState(this.length - 1) === PredictionContext.EMPTY_RETURN_STATE;
};

PredictionContext.prototype.hashString = function() {
	return this.cachedHashString;
};

function calculateHashString(parent, returnState) {
	return "" + parent + returnState;
}

function calculateEmptyHashString() {
	return "";
}

function PredictionContextCache() {
	this.cache = {};
	return this;
}
PredictionContextCache.prototype.add = function(ctx) {
	if (ctx === PredictionContext.EMPTY) {
		return PredictionContext.EMPTY;
	}
	var existing = this.cache[ctx];
	if (existing !== null) {
		return existing;
	}
	this.cache[ctx] = ctx;
	return ctx;
};

PredictionContextCache.prototype.get = function(ctx) {
	return this.cache[ctx] || null;
};

Object.defineProperty(PredictionContextCache.prototype, "length", {
	get : function() {
		return this.cache.length;
	}
});

function SingletonPredictionContext(parent, returnState) {
	var hashString = parent !== null ? calculateHashString(parent, returnState)
			: calculateEmptyHashString();
	PredictionContext.call(this, hashString);
	this.parentCtx = parent;
	this.returnState = returnState;
}

SingletonPredictionContext.prototype = Object.create(PredictionContext.prototype);
SingletonPredictionContext.prototype.contructor = SingletonPredictionContext;

SingletonPredictionContext.create = function(parent, returnState) {
	if (returnState === PredictionContext.EMPTY_RETURN_STATE && parent === null) {
		return PredictionContext.EMPTY;
	} else {
		return new SingletonPredictionContext(parent, returnState);
	}
};

Object.defineProperty(SingletonPredictionContext.prototype, "length", {
	get : function() {
		return 1;
	}
});

SingletonPredictionContext.prototype.getParent = function(index) {
	return this.parentCtx;
};

SingletonPredictionContext.prototype.getReturnState = function(index) {
	return this.returnState;
};

SingletonPredictionContext.prototype.equals = function(other) {
	if (this === other) {
		return true;
	} else if (!(other instanceof SingletonPredictionContext)) {
		return false;
	} else if (this.hashString() !== other.hashString()) {
		return false; // can't be same if hash is different
	} else {
		return this.returnState === other.returnState &&
				this.parentCtx === other.parentCtx;
	}
};

SingletonPredictionContext.prototype.hashString = function() {
	return this.cachedHashString;
};

SingletonPredictionContext.prototype.toString = function() {
	var up = this.parentCtx === null ? "" : this.parentCtx.toString();
	if (up.length === 0) {
		if (this.returnState === this.EMPTY_RETURN_STATE) {
			return "$";
		} else {
			return "" + this.returnState;
		}
	} else {
		return "" + this.returnState + " " + up;
	}
};

function EmptyPredictionContext() {
	SingletonPredictionContext.call(this, null, PredictionContext.EMPTY_RETURN_STATE);
	return this;
}

EmptyPredictionContext.prototype = Object.create(SingletonPredictionContext.prototype);
EmptyPredictionContext.prototype.constructor = EmptyPredictionContext;

EmptyPredictionContext.prototype.isEmpty = function() {
	return true;
};

EmptyPredictionContext.prototype.getParent = function(index) {
	return null;
};

EmptyPredictionContext.prototype.getReturnState = function(index) {
	return this.returnState;
};

EmptyPredictionContext.prototype.equals = function(other) {
	return this === other;
};

EmptyPredictionContext.prototype.toString = function() {
	return "$";
};

PredictionContext.EMPTY = new EmptyPredictionContext();

function ArrayPredictionContext(parents, returnStates) {
	var hash = calculateHashString(parents, returnStates);
	PredictionContext.call(this, hash);
	this.parents = parents;
	this.returnStates = returnStates;
	return this;
}

ArrayPredictionContext.prototype = Object.create(PredictionContext.prototype);
ArrayPredictionContext.prototype.constructor = ArrayPredictionContext;

ArrayPredictionContext.prototype.isEmpty = function() {
	return this.returnStates[0] === PredictionContext.EMPTY_RETURN_STATE;
};

Object.defineProperty(ArrayPredictionContext.prototype, "length", {
	get : function() {
		return this.returnStates.length;
	}
});

ArrayPredictionContext.prototype.getParent = function(index) {
	return this.parents[index];
};

ArrayPredictionContext.prototype.getReturnState = function(index) {
	return this.returnStates[index];
};

ArrayPredictionContext.prototype.equals = function(other) {
	if (this === other) {
		return true;
	} else if (!(other instanceof ArrayPredictionContext)) {
		return false;
	} else if (this.hashString !== other.hashString()) {
		return false; // can't be same if hash is different
	} else {
		return this.returnStates === other.returnStates &&
				this.parents === other.parents;
	}
};

ArrayPredictionContext.prototype.toString = function() {
	if (this.isEmpty()) {
		return "[]";
	} else {
		var s = "[";
		for (var i = 0; i < this.returnStates.length; i++) {
			if (i > 0) {
				s = s + ", ";
			}
			if (this.returnStates[i] === PredictionContext.EMPTY_RETURN_STATE) {
				s = s + "$";
				continue;
			}
			s = s + this.returnStates[i];
			if (this.parents[i] !== null) {
				s = s + " " + this.parents[i];
			} else {
				s = s + "null";
			}
		}
		return s + "]";
	}
};
function predictionContextFromRuleContext(atn, outerContext) {
	if (outerContext === undefined || outerContext === null) {
		outerContext = RuleContext.EMPTY;
	}
	if (outerContext.parentCtx === null || outerContext === RuleContext.EMPTY) {
		return PredictionContext.EMPTY;
	}
	var parent = predictionContextFromRuleContext(atn, outerContext.parentCtx);
	var state = atn.states[outerContext.invokingState];
	var transition = state.transitions[0];
	return SingletonPredictionContext.create(parent, transition.followState.stateNumber);
}

function calculateListsHashString(parents, returnStates) {
	var s = "";
	parents.map(function(p) {
		s = s + p;
	});
	returnStates.map(function(r) {
		s = s + r;
	});
	return s;
}

function merge(a, b, rootIsWildcard, mergeCache) {
	if (a === b) {
		return a;
	}
	if (a instanceof SingletonPredictionContext && b instanceof SingletonPredictionContext) {
		return mergeSingletons(a, b, rootIsWildcard, mergeCache);
	}
	if (rootIsWildcard) {
		if (a instanceof EmptyPredictionContext) {
			return a;
		}
		if (b instanceof EmptyPredictionContext) {
			return b;
		}
	}
	if (a instanceof SingletonPredictionContext) {
		a = new ArrayPredictionContext([a.getParent()], [a.returnState]);
	}
	if (b instanceof SingletonPredictionContext) {
		b = new ArrayPredictionContext([b.getParent()], [b.returnState]);
	}
	return mergeArrays(a, b, rootIsWildcard, mergeCache);
}
function mergeSingletons(a, b, rootIsWildcard, mergeCache) {
	if (mergeCache !== null) {
		var previous = mergeCache.get(a, b);
		if (previous !== null) {
			return previous;
		}
		previous = mergeCache.get(b, a);
		if (previous !== null) {
			return previous;
		}
	}

	var rootMerge = mergeRoot(a, b, rootIsWildcard);
	if (rootMerge !== null) {
		if (mergeCache !== null) {
			mergeCache.set(a, b, rootMerge);
		}
		return rootMerge;
	}
	if (a.returnState === b.returnState) {
		var parent = merge(a.parentCtx, b.parentCtx, rootIsWildcard, mergeCache);
		if (parent === a.parentCtx) {
			return a; // ax + bx = ax, if a=b
		}
		if (parent === b.parentCtx) {
			return b; // ax + bx = bx, if a=b
		}
		var spc = SingletonPredictionContext.create(parent, a.returnState);
		if (mergeCache !== null) {
			mergeCache.set(a, b, spc);
		}
		return spc;
	} else { // a != b payloads differ
		var singleParent = null;
		if (a === b || (a.parentCtx !== null && a.parentCtx === b.parentCtx)) { // ax +
			singleParent = a.parentCtx;
		}
		if (singleParent !== null) { // parents are same
			var payloads = [ a.returnState, b.returnState ];
			if (a.returnState > b.returnState) {
				payloads[0] = b.returnState;
				payloads[1] = a.returnState;
			}
			var parents = [ singleParent, singleParent ];
			var apc = new ArrayPredictionContext(parents, payloads);
			if (mergeCache !== null) {
				mergeCache.set(a, b, apc);
			}
			return apc;
		}
		var payloads = [ a.returnState, b.returnState ];
		var parents = [ a.parentCtx, b.parentCtx ];
		if (a.returnState > b.returnState) { // sort by payload
			payloads[0] = b.returnState;
			payloads[1] = a.returnState;
			parents = [ b.parentCtx, a.parentCtx ];
		}
		var a_ = new ArrayPredictionContext(parents, payloads);
		if (mergeCache !== null) {
			mergeCache.set(a, b, a_);
		}
		return a_;
	}
}
function mergeRoot(a, b, rootIsWildcard) {
	if (rootIsWildcard) {
		if (a === PredictionContext.EMPTY) {
			return PredictionContext.EMPTY; // // + b =//
		}
		if (b === PredictionContext.EMPTY) {
			return PredictionContext.EMPTY; // a +// =//
		}
	} else {
		if (a === PredictionContext.EMPTY && b === PredictionContext.EMPTY) {
			return PredictionContext.EMPTY; // $ + $ = $
		} else if (a === PredictionContext.EMPTY) { // $ + x = [$,x]
			var payloads = [ b.returnState,
					PredictionContext.EMPTY_RETURN_STATE ];
			var parents = [ b.parentCtx, null ];
			return new ArrayPredictionContext(parents, payloads);
		} else if (b === PredictionContext.EMPTY) { // x + $ = [$,x] ($ is always first if present)
			var payloads = [ a.returnState, PredictionContext.EMPTY_RETURN_STATE ];
			var parents = [ a.parentCtx, null ];
			return new ArrayPredictionContext(parents, payloads);
		}
	}
	return null;
}
function mergeArrays(a, b, rootIsWildcard, mergeCache) {
	if (mergeCache !== null) {
		var previous = mergeCache.get(a, b);
		if (previous !== null) {
			return previous;
		}
		previous = mergeCache.get(b, a);
		if (previous !== null) {
			return previous;
		}
	}
	var i = 0; // walks a
	var j = 0; // walks b
	var k = 0; // walks target M array

	var mergedReturnStates = [];
	var mergedParents = [];
	while (i < a.returnStates.length && j < b.returnStates.length) {
		var a_parent = a.parents[i];
		var b_parent = b.parents[j];
		if (a.returnStates[i] === b.returnStates[j]) {
			var payload = a.returnStates[i];
			var bothDollars = payload === PredictionContext.EMPTY_RETURN_STATE &&
					a_parent === null && b_parent === null;
			var ax_ax = (a_parent !== null && b_parent !== null && a_parent === b_parent); // ax+ax
			if (bothDollars || ax_ax) {
				mergedParents[k] = a_parent; // choose left
				mergedReturnStates[k] = payload;
			} else { // ax+ay -> a'[x,y]
				var mergedParent = merge(a_parent, b_parent, rootIsWildcard, mergeCache);
				mergedParents[k] = mergedParent;
				mergedReturnStates[k] = payload;
			}
			i += 1; // hop over left one as usual
			j += 1; // but also skip one in right side since we merge
		} else if (a.returnStates[i] < b.returnStates[j]) { // copy a[i] to M
			mergedParents[k] = a_parent;
			mergedReturnStates[k] = a.returnStates[i];
			i += 1;
		} else { // b > a, copy b[j] to M
			mergedParents[k] = b_parent;
			mergedReturnStates[k] = b.returnStates[j];
			j += 1;
		}
		k += 1;
	}
	if (i < a.returnStates.length) {
		for (var p = i; p < a.returnStates.length; p++) {
			mergedParents[k] = a.parents[p];
			mergedReturnStates[k] = a.returnStates[p];
			k += 1;
		}
	} else {
		for (var p = j; p < b.returnStates.length; p++) {
			mergedParents[k] = b.parents[p];
			mergedReturnStates[k] = b.returnStates[p];
			k += 1;
		}
	}
	if (k < mergedParents.length) { // write index < last position; trim
		if (k === 1) { // for just one merged element, return singleton top
			var a_ = SingletonPredictionContext.create(mergedParents[0],
					mergedReturnStates[0]);
			if (mergeCache !== null) {
				mergeCache.set(a, b, a_);
			}
			return a_;
		}
		mergedParents = mergedParents.slice(0, k);
		mergedReturnStates = mergedReturnStates.slice(0, k);
	}

	var M = new ArrayPredictionContext(mergedParents, mergedReturnStates);
	if (M === a) {
		if (mergeCache !== null) {
			mergeCache.set(a, b, a);
		}
		return a;
	}
	if (M === b) {
		if (mergeCache !== null) {
			mergeCache.set(a, b, b);
		}
		return b;
	}
	combineCommonParents(mergedParents);

	if (mergeCache !== null) {
		mergeCache.set(a, b, M);
	}
	return M;
}
function combineCommonParents(parents) {
	var uniqueParents = {};

	for (var p = 0; p < parents.length; p++) {
		var parent = parents[p];
		if (!(parent in uniqueParents)) {
			uniqueParents[parent] = parent;
		}
	}
	for (var q = 0; q < parents.length; q++) {
		parents[q] = uniqueParents[parents[q]];
	}
}

function getCachedPredictionContext(context, contextCache, visited) {
	if (context.isEmpty()) {
		return context;
	}
	var existing = visited[context] || null;
	if (existing !== null) {
		return existing;
	}
	existing = contextCache.get(context);
	if (existing !== null) {
		visited[context] = existing;
		return existing;
	}
	var changed = false;
	var parents = [];
	for (var i = 0; i < parents.length; i++) {
		var parent = getCachedPredictionContext(context.getParent(i), contextCache, visited);
		if (changed || parent !== context.getParent(i)) {
			if (!changed) {
				parents = [];
				for (var j = 0; j < context.length; j++) {
					parents[j] = context.getParent(j);
				}
				changed = true;
			}
			parents[i] = parent;
		}
	}
	if (!changed) {
		contextCache.add(context);
		visited[context] = context;
		return context;
	}
	var updated = null;
	if (parents.length === 0) {
		updated = PredictionContext.EMPTY;
	} else if (parents.length === 1) {
		updated = SingletonPredictionContext.create(parents[0], context
				.getReturnState(0));
	} else {
		updated = new ArrayPredictionContext(parents, context.returnStates);
	}
	contextCache.add(updated);
	visited[updated] = updated;
	visited[context] = updated;

	return updated;
}
function getAllContextNodes(context, nodes, visited) {
	if (nodes === null) {
		nodes = [];
		return getAllContextNodes(context, nodes, visited);
	} else if (visited === null) {
		visited = {};
		return getAllContextNodes(context, nodes, visited);
	} else {
		if (context === null || visited[context] !== null) {
			return nodes;
		}
		visited[context] = context;
		nodes.push(context);
		for (var i = 0; i < context.length; i++) {
			getAllContextNodes(context.getParent(i), nodes, visited);
		}
		return nodes;
	}
}

exports.merge = merge;
exports.PredictionContext = PredictionContext;
exports.PredictionContextCache = PredictionContextCache;
exports.SingletonPredictionContext = SingletonPredictionContext;
exports.predictionContextFromRuleContext = predictionContextFromRuleContext;
exports.getCachedPredictionContext = getCachedPredictionContext;
});

define("ace/mode/cql/antlr4/LL1Analyzer",["require","exports","module","ace/mode/cql/antlr4/Utils","ace/mode/cql/antlr4/Utils","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/atn/ATNConfig","ace/mode/cql/antlr4/IntervalSet","ace/mode/cql/antlr4/IntervalSet","ace/mode/cql/antlr4/atn/ATNState","ace/mode/cql/antlr4/atn/Transition","ace/mode/cql/antlr4/atn/Transition","ace/mode/cql/antlr4/atn/Transition","ace/mode/cql/antlr4/atn/Transition","ace/mode/cql/antlr4/PredictionContext"], function(require, exports, module) {

var Set = require('./Utils').Set;
var BitSet = require('./Utils').BitSet;
var Token = require('./Token').Token;
var ATNConfig = require('./atn/ATNConfig').ATNConfig;
var Interval = require('./IntervalSet').Interval;
var IntervalSet = require('./IntervalSet').IntervalSet;
var RuleStopState = require('./atn/ATNState').RuleStopState;
var RuleTransition = require('./atn/Transition').RuleTransition;
var NotSetTransition = require('./atn/Transition').NotSetTransition;
var WildcardTransition = require('./atn/Transition').WildcardTransition;
var AbstractPredicateTransition = require('./atn/Transition').AbstractPredicateTransition;

var pc = require('./PredictionContext');
var predictionContextFromRuleContext = pc.predictionContextFromRuleContext;
var PredictionContext = pc.PredictionContext;
var SingletonPredictionContext = pc.SingletonPredictionContext;

function LL1Analyzer (atn) {
    this.atn = atn;
}
LL1Analyzer.HIT_PRED = Token.INVALID_TYPE;
LL1Analyzer.prototype.getDecisionLookahead = function(s) {
    if (s === null) {
        return null;
    }
    var count = s.transitions.length;
    var look = [];
    for(var alt=0; alt< count; alt++) {
        look[alt] = new IntervalSet();
        var lookBusy = new Set();
        var seeThruPreds = false; // fail to get lookahead upon pred
        this._LOOK(s.transition(alt).target, null, PredictionContext.EMPTY,
              look[alt], lookBusy, new BitSet(), seeThruPreds, false);
        if (look[alt].length===0 || look[alt].contains(LL1Analyzer.HIT_PRED)) {
            look[alt] = null;
        }
    }
    return look;
};
LL1Analyzer.prototype.LOOK = function(s, stopState, ctx) {
    var r = new IntervalSet();
    var seeThruPreds = true; // ignore preds; get all lookahead
	ctx = ctx || null;
    var lookContext = ctx!==null ? predictionContextFromRuleContext(s.atn, ctx) : null;
    this._LOOK(s, stopState, lookContext, r, new Set(), new BitSet(), seeThruPreds, true);
    return r;
};
LL1Analyzer.prototype._LOOK = function(s, stopState , ctx, look, lookBusy, calledRuleStack, seeThruPreds, addEOF) {
    var c = new ATNConfig({state:s, alt:0}, ctx);
    if (lookBusy.contains(c)) {
        return;
    }
    lookBusy.add(c);
    if (s === stopState) {
        if (ctx ===null) {
            look.addOne(Token.EPSILON);
            return;
        } else if (ctx.isEmpty() && addEOF) {
            look.addOne(Token.EOF);
            return;
        }
    }
    if (s instanceof RuleStopState ) {
        if (ctx ===null) {
            look.addOne(Token.EPSILON);
            return;
        } else if (ctx.isEmpty() && addEOF) {
            look.addOne(Token.EOF);
            return;
        }
        if (ctx !== PredictionContext.EMPTY) {
            for(var i=0; i<ctx.length; i++) {
                var returnState = this.atn.states[ctx.getReturnState(i)];
                var removed = calledRuleStack.contains(returnState.ruleIndex);
                try {
                    calledRuleStack.remove(returnState.ruleIndex);
                    this._LOOK(returnState, stopState, ctx.getParent(i), look, lookBusy, calledRuleStack, seeThruPreds, addEOF);
                } finally {
                    if (removed) {
                        calledRuleStack.add(returnState.ruleIndex);
                    }
                }
            }
            return;
        }
    }
    for(var j=0; j<s.transitions.length; j++) {
        var t = s.transitions[j];
        if (t.constructor === RuleTransition) {
            if (calledRuleStack.contains(t.target.ruleIndex)) {
                continue;
            }
            var newContext = SingletonPredictionContext.create(ctx, t.followState.stateNumber);
            try {
                calledRuleStack.add(t.target.ruleIndex);
                this._LOOK(t.target, stopState, newContext, look, lookBusy, calledRuleStack, seeThruPreds, addEOF);
            } finally {
                calledRuleStack.remove(t.target.ruleIndex);
            }
        } else if (t instanceof AbstractPredicateTransition ) {
            if (seeThruPreds) {
                this._LOOK(t.target, stopState, ctx, look, lookBusy, calledRuleStack, seeThruPreds, addEOF);
            } else {
                look.addOne(LL1Analyzer.HIT_PRED);
            }
        } else if( t.isEpsilon) {
            this._LOOK(t.target, stopState, ctx, look, lookBusy, calledRuleStack, seeThruPreds, addEOF);
        } else if (t.constructor === WildcardTransition) {
            look.addRange( Token.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType );
        } else {
            var set = t.label;
            if (set !== null) {
                if (t instanceof NotSetTransition) {
                    set = set.complement(Token.MIN_USER_TOKEN_TYPE, this.atn.maxTokenType);
                }
                look.addSet(set);
            }
        }
    }
};

exports.LL1Analyzer = LL1Analyzer;
});

define("ace/mode/cql/antlr4/atn/ATN",["require","exports","module","ace/mode/cql/antlr4/LL1Analyzer","ace/mode/cql/antlr4/IntervalSet","ace/mode/cql/antlr4/Token"], function(require, exports, module) {

var LL1Analyzer = require('./../LL1Analyzer').LL1Analyzer;
var IntervalSet = require('./../IntervalSet').IntervalSet;

function ATN(grammarType , maxTokenType) {
    this.grammarType = grammarType;
    this.maxTokenType = maxTokenType;
    this.states = [];
    this.decisionToState = [];
    this.ruleToStartState = [];
    this.ruleToStopState = null;
    this.modeNameToStartState = {};
    this.ruleToTokenType = null;
    this.lexerActions = null;
    this.modeToStartState = [];

    return this;
}
ATN.prototype.nextTokensInContext = function(s, ctx) {
    var anal = new LL1Analyzer(this);
    return anal.LOOK(s, null, ctx);
};
ATN.prototype.nextTokensNoContext = function(s) {
    if (s.nextTokenWithinRule !== null ) {
        return s.nextTokenWithinRule;
    }
    s.nextTokenWithinRule = this.nextTokensInContext(s, null);
    s.nextTokenWithinRule.readonly = true;
    return s.nextTokenWithinRule;
};

ATN.prototype.nextTokens = function(s, ctx) {
    if ( ctx===undefined ) {
        return this.nextTokensNoContext(s);
    } else {
        return this.nextTokensInContext(s, ctx);
    }
};

ATN.prototype.addState = function( state) {
    if ( state !== null ) {
        state.atn = this;
        state.stateNumber = this.states.length;
    }
    this.states.push(state);
};

ATN.prototype.removeState = function( state) {
    this.states[state.stateNumber] = null; // just free mem, don't shift states in list
};

ATN.prototype.defineDecisionState = function( s) {
    this.decisionToState.push(s);
    s.decision = this.decisionToState.length-1;
    return s.decision;
};

ATN.prototype.getDecisionState = function( decision) {
    if (this.decisionToState.length===0) {
        return null;
    } else {
        return this.decisionToState[decision];
    }
};
var Token = require('./../Token').Token;

ATN.prototype.getExpectedTokens = function( stateNumber, ctx ) {
    if ( stateNumber < 0 || stateNumber >= this.states.length ) {
        throw("Invalid state number.");
    }
    var s = this.states[stateNumber];
    var following = this.nextTokens(s);
    if (!following.contains(Token.EPSILON)) {
        return following;
    }
    var expected = new IntervalSet();
    expected.addSet(following);
    expected.removeOne(Token.EPSILON);
    while (ctx !== null && ctx.invokingState >= 0 && following.contains(Token.EPSILON)) {
        var invokingState = this.states[ctx.invokingState];
        var rt = invokingState.transitions[0];
        following = this.nextTokens(rt.followState);
        expected.addSet(following);
        expected.removeOne(Token.EPSILON);
        ctx = ctx.parentCtx;
    }
    if (following.contains(Token.EPSILON)) {
        expected.addOne(Token.EOF);
    }
    return expected;
};

ATN.INVALID_ALT_NUMBER = 0;

exports.ATN = ATN;
});

define("ace/mode/cql/antlr4/atn/ATNType",["require","exports","module"], function(require, exports, module) {

function ATNType() {
	
}

ATNType.LEXER = 0;
ATNType.PARSER = 1;

exports.ATNType = ATNType;
});

define("ace/mode/cql/antlr4/atn/ATNDeserializationOptions",["require","exports","module"], function(require, exports, module) {

function ATNDeserializationOptions(copyFrom) {
	if(copyFrom===undefined) {
		copyFrom = null;
	}
	this.readOnly = false;
    this.verifyATN = copyFrom===null ? true : copyFrom.verifyATN;
    this.generateRuleBypassTransitions = copyFrom===null ? false : copyFrom.generateRuleBypassTransitions;

    return this;
}

ATNDeserializationOptions.defaultOptions = new ATNDeserializationOptions();
ATNDeserializationOptions.defaultOptions.readOnly = true;

exports.ATNDeserializationOptions = ATNDeserializationOptions;

});

define("ace/mode/cql/antlr4/atn/LexerAction",["require","exports","module"], function(require, exports, module) {

function LexerActionType() {
}

LexerActionType.CHANNEL = 0;     //The type of a {@link LexerChannelAction} action.
LexerActionType.CUSTOM = 1;      //The type of a {@link LexerCustomAction} action.
LexerActionType.MODE = 2;        //The type of a {@link LexerModeAction} action.
LexerActionType.MORE = 3;        //The type of a {@link LexerMoreAction} action.
LexerActionType.POP_MODE = 4;    //The type of a {@link LexerPopModeAction} action.
LexerActionType.PUSH_MODE = 5;   //The type of a {@link LexerPushModeAction} action.
LexerActionType.SKIP = 6;        //The type of a {@link LexerSkipAction} action.
LexerActionType.TYPE = 7;        //The type of a {@link LexerTypeAction} action.

function LexerAction(action) {
    this.actionType = action;
    this.isPositionDependent = false;
    return this;
}

LexerAction.prototype.hashString = function() {
    return "" + this.actionType;
};

LexerAction.prototype.equals = function(other) {
    return this === other;
};
function LexerSkipAction() {
	LexerAction.call(this, LexerActionType.SKIP);
	return this;
}

LexerSkipAction.prototype = Object.create(LexerAction.prototype);
LexerSkipAction.prototype.constructor = LexerSkipAction;
LexerSkipAction.INSTANCE = new LexerSkipAction();

LexerSkipAction.prototype.execute = function(lexer) {
    lexer.skip();
};

LexerSkipAction.prototype.toString = function() {
	return "skip";
};
function LexerTypeAction(type) {
	LexerAction.call(this, LexerActionType.TYPE);
	this.type = type;
	return this;
}

LexerTypeAction.prototype = Object.create(LexerAction.prototype);
LexerTypeAction.prototype.constructor = LexerTypeAction;

LexerTypeAction.prototype.execute = function(lexer) {
    lexer.type = this.type;
};

LexerTypeAction.prototype.hashString = function() {
	return "" + this.actionType + this.type;
};


LexerTypeAction.prototype.equals = function(other) {
    if(this === other) {
        return true;
    } else if (! (other instanceof LexerTypeAction)) {
        return false;
    } else {
        return this.type === other.type;
    }
};

LexerTypeAction.prototype.toString = function() {
    return "type(" + this.type + ")";
};
function LexerPushModeAction(mode) {
	LexerAction.call(this, LexerActionType.PUSH_MODE);
    this.mode = mode;
    return this;
}

LexerPushModeAction.prototype = Object.create(LexerAction.prototype);
LexerPushModeAction.prototype.constructor = LexerPushModeAction;
LexerPushModeAction.prototype.execute = function(lexer) {
    lexer.pushMode(this.mode);
};

LexerPushModeAction.prototype.hashString = function() {
    return "" + this.actionType + this.mode;
};

LexerPushModeAction.prototype.equals = function(other) {
    if (this === other) {
        return true;
    } else if (! (other instanceof LexerPushModeAction)) {
        return false;
    } else {
        return this.mode === other.mode;
    }
};

LexerPushModeAction.prototype.toString = function() {
	return "pushMode(" + this.mode + ")";
};
function LexerPopModeAction() {
	LexerAction.call(this,LexerActionType.POP_MODE);
	return this;
}

LexerPopModeAction.prototype = Object.create(LexerAction.prototype);
LexerPopModeAction.prototype.constructor = LexerPopModeAction;

LexerPopModeAction.INSTANCE = new LexerPopModeAction();
LexerPopModeAction.prototype.execute = function(lexer) {
    lexer.popMode();
};

LexerPopModeAction.prototype.toString = function() {
	return "popMode";
};
function LexerMoreAction() {
	LexerAction.call(this, LexerActionType.MORE);
	return this;
}

LexerMoreAction.prototype = Object.create(LexerAction.prototype);
LexerMoreAction.prototype.constructor = LexerMoreAction;

LexerMoreAction.INSTANCE = new LexerMoreAction();
LexerMoreAction.prototype.execute = function(lexer) {
    lexer.more();
};

LexerMoreAction.prototype.toString = function() {
    return "more";
};
function LexerModeAction(mode) {
	LexerAction.call(this, LexerActionType.MODE);
    this.mode = mode;
    return this;
}

LexerModeAction.prototype = Object.create(LexerAction.prototype);
LexerModeAction.prototype.constructor = LexerModeAction;
LexerModeAction.prototype.execute = function(lexer) {
    lexer.mode(this.mode);
};

LexerModeAction.prototype.hashString = function() {
	return "" + this.actionType + this.mode;
};

LexerModeAction.prototype.equals = function(other) {
    if (this === other) {
        return true;
    } else if (! (other instanceof LexerModeAction)) {
        return false;
    } else {
        return this.mode === other.mode;
    }
};

LexerModeAction.prototype.toString = function() {
    return "mode(" + this.mode + ")";
};

function LexerCustomAction(ruleIndex, actionIndex) {
	LexerAction.call(this, LexerActionType.CUSTOM);
    this.ruleIndex = ruleIndex;
    this.actionIndex = actionIndex;
    this.isPositionDependent = true;
    return this;
}

LexerCustomAction.prototype = Object.create(LexerAction.prototype);
LexerCustomAction.prototype.constructor = LexerCustomAction;
LexerCustomAction.prototype.execute = function(lexer) {
    lexer.action(null, this.ruleIndex, this.actionIndex);
};

LexerCustomAction.prototype.hashString = function() {
    return "" + this.actionType + this.ruleIndex + this.actionIndex;
};

LexerCustomAction.prototype.equals = function(other) {
    if (this === other) {
        return true;
    } else if (! (other instanceof LexerCustomAction)) {
        return false;
    } else {
        return this.ruleIndex === other.ruleIndex && this.actionIndex === other.actionIndex;
    }
};
function LexerChannelAction(channel) {
	LexerAction.call(this, LexerActionType.CHANNEL);
    this.channel = channel;
    return this;
}

LexerChannelAction.prototype = Object.create(LexerAction.prototype);
LexerChannelAction.prototype.constructor = LexerChannelAction;
LexerChannelAction.prototype.execute = function(lexer) {
    lexer._channel = this.channel;
};

LexerChannelAction.prototype.hashString = function() {
    return "" + this.actionType + this.channel;
};

LexerChannelAction.prototype.equals = function(other) {
    if (this === other) {
        return true;
    } else if (! (other instanceof LexerChannelAction)) {
        return false;
    } else {
        return this.channel === other.channel;
    }
};

LexerChannelAction.prototype.toString = function() {
    return "channel(" + this.channel + ")";
};
function LexerIndexedCustomAction(offset, action) {
	LexerAction.call(this, action.actionType);
    this.offset = offset;
    this.action = action;
    this.isPositionDependent = true;
    return this;
}

LexerIndexedCustomAction.prototype = Object.create(LexerAction.prototype);
LexerIndexedCustomAction.prototype.constructor = LexerIndexedCustomAction;
LexerIndexedCustomAction.prototype.execute = function(lexer) {
    this.action.execute(lexer);
};

LexerIndexedCustomAction.prototype.hashString = function() {
    return "" + this.actionType + this.offset + this.action;
};

LexerIndexedCustomAction.prototype.equals = function(other) {
    if (this === other) {
        return true;
    } else if (! (other instanceof LexerIndexedCustomAction)) {
        return false;
    } else {
        return this.offset === other.offset && this.action === other.action;
    }
};


exports.LexerActionType = LexerActionType;
exports.LexerSkipAction = LexerSkipAction;
exports.LexerChannelAction = LexerChannelAction;
exports.LexerCustomAction = LexerCustomAction;
exports.LexerIndexedCustomAction = LexerIndexedCustomAction;
exports.LexerMoreAction = LexerMoreAction;
exports.LexerTypeAction = LexerTypeAction;
exports.LexerPushModeAction = LexerPushModeAction;
exports.LexerPopModeAction = LexerPopModeAction;
exports.LexerModeAction = LexerModeAction;
});

define("ace/mode/cql/antlr4/atn/ATNDeserializer",["require","exports","module","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/atn/ATN","ace/mode/cql/antlr4/atn/ATNType","ace/mode/cql/antlr4/atn/ATNState","ace/mode/cql/antlr4/atn/Transition","ace/mode/cql/antlr4/IntervalSet","ace/mode/cql/antlr4/IntervalSet","ace/mode/cql/antlr4/atn/ATNDeserializationOptions","ace/mode/cql/antlr4/atn/LexerAction"], function(require, exports, module) {

var Token = require('./../Token').Token;
var ATN = require('./ATN').ATN;
var ATNType = require('./ATNType').ATNType;
var ATNStates = require('./ATNState');
var ATNState = ATNStates.ATNState;
var BasicState = ATNStates.BasicState;
var DecisionState = ATNStates.DecisionState;
var BlockStartState = ATNStates.BlockStartState;
var BlockEndState = ATNStates.BlockEndState;
var LoopEndState = ATNStates.LoopEndState;
var RuleStartState = ATNStates.RuleStartState;
var RuleStopState = ATNStates.RuleStopState;
var TokensStartState = ATNStates.TokensStartState;
var PlusLoopbackState = ATNStates.PlusLoopbackState;
var StarLoopbackState = ATNStates.StarLoopbackState;
var StarLoopEntryState = ATNStates.StarLoopEntryState;
var PlusBlockStartState = ATNStates.PlusBlockStartState;
var StarBlockStartState = ATNStates.StarBlockStartState;
var BasicBlockStartState = ATNStates.BasicBlockStartState;
var Transitions = require('./Transition');
var Transition = Transitions.Transition;
var AtomTransition = Transitions.AtomTransition;
var SetTransition = Transitions.SetTransition;
var NotSetTransition = Transitions.NotSetTransition;
var RuleTransition = Transitions.RuleTransition;
var RangeTransition = Transitions.RangeTransition;
var ActionTransition = Transitions.ActionTransition;
var EpsilonTransition = Transitions.EpsilonTransition;
var WildcardTransition = Transitions.WildcardTransition;
var PredicateTransition = Transitions.PredicateTransition;
var PrecedencePredicateTransition = Transitions.PrecedencePredicateTransition;
var IntervalSet = require('./../IntervalSet').IntervalSet;
var Interval = require('./../IntervalSet').Interval;
var ATNDeserializationOptions = require('./ATNDeserializationOptions').ATNDeserializationOptions;
var LexerActions = require('./LexerAction');
var LexerActionType = LexerActions.LexerActionType;
var LexerSkipAction = LexerActions.LexerSkipAction;
var LexerChannelAction = LexerActions.LexerChannelAction;
var LexerCustomAction = LexerActions.LexerCustomAction;
var LexerMoreAction = LexerActions.LexerMoreAction;
var LexerTypeAction = LexerActions.LexerTypeAction;
var LexerPushModeAction = LexerActions.LexerPushModeAction;
var LexerPopModeAction = LexerActions.LexerPopModeAction;
var LexerModeAction = LexerActions.LexerModeAction;
var BASE_SERIALIZED_UUID = "AADB8D7E-AEEF-4415-AD2B-8204D6CF042E";
var SUPPORTED_UUIDS = [ BASE_SERIALIZED_UUID ];

var SERIALIZED_VERSION = 3;
var SERIALIZED_UUID = BASE_SERIALIZED_UUID;

function initArray( length, value) {
	var tmp = [];
	tmp[length-1] = value;
	return tmp.map(function(i) {return value;});
}

function ATNDeserializer (options) {
	
    if ( options=== undefined || options === null ) {
        options = ATNDeserializationOptions.defaultOptions;
    }
    this.deserializationOptions = options;
    this.stateFactories = null;
    this.actionFactories = null;
    
    return this;
}

ATNDeserializer.prototype.isFeatureSupported = function(feature, actualUuid) {
    var idx1 = SUPPORTED_UUIDS.index(feature);
    if (idx1<0) {
        return false;
    }
    var idx2 = SUPPORTED_UUIDS.index(actualUuid);
    return idx2 >= idx1;
};

ATNDeserializer.prototype.deserialize = function(data) {
    this.reset(data);
    this.checkVersion();
    this.checkUUID();
    var atn = this.readATN();
    this.readStates(atn);
    this.readRules(atn);
    this.readModes(atn);
    var sets = this.readSets(atn);
    this.readEdges(atn, sets);
    this.readDecisions(atn);
    this.readLexerActions(atn);
    this.markPrecedenceDecisions(atn);
    this.verifyATN(atn);
    if (this.deserializationOptions.generateRuleBypassTransitions && atn.grammarType === ATNType.PARSER ) {
        this.generateRuleBypassTransitions(atn);
        this.verifyATN(atn);
    }
    return atn;
};

ATNDeserializer.prototype.reset = function(data) {
	var adjust = function(c) {
        var v = c.charCodeAt(0);
        return v>1  ? v-2 : -1;
	};
    var temp = data.split("").map(adjust);
    temp[0] = data.charCodeAt(0);
    this.data = temp;
    this.pos = 0;
};

ATNDeserializer.prototype.checkVersion = function() {
    var version = this.readInt();
    if ( version !== SERIALIZED_VERSION ) {
        throw ("Could not deserialize ATN with version " + version + " (expected " + SERIALIZED_VERSION + ").");
    }
};

ATNDeserializer.prototype.checkUUID = function() {
    var uuid = this.readUUID();
    if (SUPPORTED_UUIDS.indexOf(uuid)<0) {
        throw ("Could not deserialize ATN with UUID: " + uuid +
                        " (expected " + SERIALIZED_UUID + " or a legacy UUID).", uuid, SERIALIZED_UUID);
    }
    this.uuid = uuid;
};

ATNDeserializer.prototype.readATN = function() {
    var grammarType = this.readInt();
    var maxTokenType = this.readInt();
    return new ATN(grammarType, maxTokenType);
};

ATNDeserializer.prototype.readStates = function(atn) {
	var j, pair, stateNumber;
    var loopBackStateNumbers = [];
    var endStateNumbers = [];
    var nstates = this.readInt();
    for(var i=0; i<nstates; i++) {
        var stype = this.readInt();
        if (stype===ATNState.INVALID_TYPE) {
            atn.addState(null);
            continue;
        }
        var ruleIndex = this.readInt();
        if (ruleIndex === 0xFFFF) {
            ruleIndex = -1;
        }
        var s = this.stateFactory(stype, ruleIndex);
        if (stype === ATNState.LOOP_END) { // special case
            var loopBackStateNumber = this.readInt();
            loopBackStateNumbers.push([s, loopBackStateNumber]);
        } else if(s instanceof BlockStartState) {
            var endStateNumber = this.readInt();
            endStateNumbers.push([s, endStateNumber]);
        }
        atn.addState(s);
    }
    for (j=0; j<loopBackStateNumbers.length; j++) {
        pair = loopBackStateNumbers[j];
        pair[0].loopBackState = atn.states[pair[1]];
    }

    for (j=0; j<endStateNumbers.length; j++) {
        pair = endStateNumbers[j];
        pair[0].endState = atn.states[pair[1]];
    }
    
    var numNonGreedyStates = this.readInt();
    for (j=0; j<numNonGreedyStates; j++) {
        stateNumber = this.readInt();
        atn.states[stateNumber].nonGreedy = true;
    }

    var numPrecedenceStates = this.readInt();
    for (j=0; j<numPrecedenceStates; j++) {
        stateNumber = this.readInt();
        atn.states[stateNumber].isPrecedenceRule = true;
    }
};

ATNDeserializer.prototype.readRules = function(atn) {
    var i;
    var nrules = this.readInt();
    if (atn.grammarType === ATNType.LEXER ) {
        atn.ruleToTokenType = initArray(nrules, 0);
    }
    atn.ruleToStartState = initArray(nrules, 0);
    for (i=0; i<nrules; i++) {
        var s = this.readInt();
        var startState = atn.states[s];
        atn.ruleToStartState[i] = startState;
        if ( atn.grammarType === ATNType.LEXER ) {
            var tokenType = this.readInt();
            if (tokenType === 0xFFFF) {
                tokenType = Token.EOF;
            }
            atn.ruleToTokenType[i] = tokenType;
        }
    }
    atn.ruleToStopState = initArray(nrules, 0);
    for (i=0; i<atn.states.length; i++) {
        var state = atn.states[i];
        if (!(state instanceof RuleStopState)) {
            continue;
        }
        atn.ruleToStopState[state.ruleIndex] = state;
        atn.ruleToStartState[state.ruleIndex].stopState = state;
    }
};

ATNDeserializer.prototype.readModes = function(atn) {
    var nmodes = this.readInt();
    for (var i=0; i<nmodes; i++) {
        var s = this.readInt();
        atn.modeToStartState.push(atn.states[s]);
    }
};

ATNDeserializer.prototype.readSets = function(atn) {
    var sets = [];
    var m = this.readInt();
    for (var i=0; i<m; i++) {
        var iset = new IntervalSet();
        sets.push(iset);
        var n = this.readInt();
        var containsEof = this.readInt();
        if (containsEof!==0) {
            iset.addOne(-1);
        }
        for (var j=0; j<n; j++) {
            var i1 = this.readInt();
            var i2 = this.readInt();
            iset.addRange(i1, i2);
        }
    }
    return sets;
};

ATNDeserializer.prototype.readEdges = function(atn, sets) {
	var i, j, state, trans, target;
    var nedges = this.readInt();
    for (i=0; i<nedges; i++) {
        var src = this.readInt();
        var trg = this.readInt();
        var ttype = this.readInt();
        var arg1 = this.readInt();
        var arg2 = this.readInt();
        var arg3 = this.readInt();
        trans = this.edgeFactory(atn, ttype, src, trg, arg1, arg2, arg3, sets);
        var srcState = atn.states[src];
        srcState.addTransition(trans);
    }
    for (i=0; i<atn.states.length; i++) {
        state = atn.states[i];
        for (j=0; j<state.transitions.length; j++) {
            var t = state.transitions[j];
            if (!(t instanceof RuleTransition)) {
                continue;
            }
			var outermostPrecedenceReturn = -1;
			if (atn.ruleToStartState[t.target.ruleIndex].isPrecedenceRule) {
				if (t.precedence === 0) {
					outermostPrecedenceReturn = t.target.ruleIndex;
				}
			}

			trans = new EpsilonTransition(t.followState, outermostPrecedenceReturn);
            atn.ruleToStopState[t.target.ruleIndex].addTransition(trans);
        }
    }

    for (i=0; i<atn.states.length; i++) {
        state = atn.states[i];
        if (state instanceof BlockStartState) {
            if (state.endState === null) {
                throw ("IllegalState");
            }
            if ( state.endState.startState !== null) {
                throw ("IllegalState");
            }
            state.endState.startState = state;
        }
        if (state instanceof PlusLoopbackState) {
            for (j=0; j<state.transitions.length; j++) {
                target = state.transitions[j].target;
                if (target instanceof PlusBlockStartState) {
                    target.loopBackState = state;
                }
            }
        } else if (state instanceof StarLoopbackState) {
            for (j=0; j<state.transitions.length; j++) {
                target = state.transitions[j].target;
                if (target instanceof StarLoopEntryState) {
                    target.loopBackState = state;
                }
            }
        }
    }
};

ATNDeserializer.prototype.readDecisions = function(atn) {
    var ndecisions = this.readInt();
    for (var i=0; i<ndecisions; i++) {
        var s = this.readInt();
        var decState = atn.states[s];
        atn.decisionToState.push(decState);
        decState.decision = i;
    }
};

ATNDeserializer.prototype.readLexerActions = function(atn) {
    if (atn.grammarType === ATNType.LEXER) {
        var count = this.readInt();
        atn.lexerActions = initArray(count, null);
        for (var i=0; i<count; i++) {
            var actionType = this.readInt();
            var data1 = this.readInt();
            if (data1 === 0xFFFF) {
                data1 = -1;
            }
            var data2 = this.readInt();
            if (data2 === 0xFFFF) {
                data2 = -1;
            }
            var lexerAction = this.lexerActionFactory(actionType, data1, data2);
            atn.lexerActions[i] = lexerAction;
        }
    }
};

ATNDeserializer.prototype.generateRuleBypassTransitions = function(atn) {
	var i;
    var count = atn.ruleToStartState.length;
    for(i=0; i<count; i++) {
        atn.ruleToTokenType[i] = atn.maxTokenType + i + 1;
    }
    for(i=0; i<count; i++) {
        this.generateRuleBypassTransition(atn, i);
    }
};

ATNDeserializer.prototype.generateRuleBypassTransition = function(atn, idx) {
	var i, state;
    var bypassStart = new BasicBlockStartState();
    bypassStart.ruleIndex = idx;
    atn.addState(bypassStart);

    var bypassStop = new BlockEndState();
    bypassStop.ruleIndex = idx;
    atn.addState(bypassStop);

    bypassStart.endState = bypassStop;
    atn.defineDecisionState(bypassStart);

    bypassStop.startState = bypassStart;

    var excludeTransition = null;
    var endState = null;
    
    if (atn.ruleToStartState[idx].isPrecedenceRule) {
        endState = null;
        for(i=0; i<atn.states.length; i++) {
            state = atn.states[i];
            if (this.stateIsEndStateFor(state, idx)) {
                endState = state;
                excludeTransition = state.loopBackState.transitions[0];
                break;
            }
        }
        if (excludeTransition === null) {
            throw ("Couldn't identify final state of the precedence rule prefix section.");
        }
    } else {
        endState = atn.ruleToStopState[idx];
    }
    for(i=0; i<atn.states.length; i++) {
        state = atn.states[i];
        for(var j=0; j<state.transitions.length; j++) {
            var transition = state.transitions[j];
            if (transition === excludeTransition) {
                continue;
            }
            if (transition.target === endState) {
                transition.target = bypassStop;
            }
        }
    }
    var ruleToStartState = atn.ruleToStartState[idx];
    var count = ruleToStartState.transitions.length;
    while ( count > 0) {
        bypassStart.addTransition(ruleToStartState.transitions[count-1]);
        ruleToStartState.transitions = ruleToStartState.transitions.slice(-1);
    }
    atn.ruleToStartState[idx].addTransition(new EpsilonTransition(bypassStart));
    bypassStop.addTransition(new EpsilonTransition(endState));

    var matchState = new BasicState();
    atn.addState(matchState);
    matchState.addTransition(new AtomTransition(bypassStop, atn.ruleToTokenType[idx]));
    bypassStart.addTransition(new EpsilonTransition(matchState));
};

ATNDeserializer.prototype.stateIsEndStateFor = function(state, idx) {
    if ( state.ruleIndex !== idx) {
        return null;
    }
    if (!( state instanceof StarLoopEntryState)) {
        return null;
    }
    var maybeLoopEndState = state.transitions[state.transitions.length - 1].target;
    if (!( maybeLoopEndState instanceof LoopEndState)) {
        return null;
    }
    if (maybeLoopEndState.epsilonOnlyTransitions &&
        (maybeLoopEndState.transitions[0].target instanceof RuleStopState)) {
        return state;
    } else {
        return null;
    }
};
ATNDeserializer.prototype.markPrecedenceDecisions = function(atn) {
	for(var i=0; i<atn.states.length; i++) {
		var state = atn.states[i];
		if (!( state instanceof StarLoopEntryState)) {
            continue;
        }
        if ( atn.ruleToStartState[state.ruleIndex].isPrecedenceRule) {
            var maybeLoopEndState = state.transitions[state.transitions.length - 1].target;
            if (maybeLoopEndState instanceof LoopEndState) {
                if ( maybeLoopEndState.epsilonOnlyTransitions &&
                        (maybeLoopEndState.transitions[0].target instanceof RuleStopState)) {
                    state.precedenceRuleDecision = true;
                }
            }
        }
	}
};

ATNDeserializer.prototype.verifyATN = function(atn) {
    if (!this.deserializationOptions.verifyATN) {
        return;
    }
	for(var i=0; i<atn.states.length; i++) {
        var state = atn.states[i];
        if (state === null) {
            continue;
        }
        this.checkCondition(state.epsilonOnlyTransitions || state.transitions.length <= 1);
        if (state instanceof PlusBlockStartState) {
            this.checkCondition(state.loopBackState !== null);
        } else  if (state instanceof StarLoopEntryState) {
            this.checkCondition(state.loopBackState !== null);
            this.checkCondition(state.transitions.length === 2);
            if (state.transitions[0].target instanceof StarBlockStartState) {
                this.checkCondition(state.transitions[1].target instanceof LoopEndState);
                this.checkCondition(!state.nonGreedy);
            } else if (state.transitions[0].target instanceof LoopEndState) {
                this.checkCondition(state.transitions[1].target instanceof StarBlockStartState);
                this.checkCondition(state.nonGreedy);
            } else {
                throw("IllegalState");
            }
        } else if (state instanceof StarLoopbackState) {
            this.checkCondition(state.transitions.length === 1);
            this.checkCondition(state.transitions[0].target instanceof StarLoopEntryState);
        } else if (state instanceof LoopEndState) {
            this.checkCondition(state.loopBackState !== null);
        } else if (state instanceof RuleStartState) {
            this.checkCondition(state.stopState !== null);
        } else if (state instanceof BlockStartState) {
            this.checkCondition(state.endState !== null);
        } else if (state instanceof BlockEndState) {
            this.checkCondition(state.startState !== null);
        } else if (state instanceof DecisionState) {
            this.checkCondition(state.transitions.length <= 1 || state.decision >= 0);
        } else {
            this.checkCondition(state.transitions.length <= 1 || (state instanceof RuleStopState));
        }
	}
};

ATNDeserializer.prototype.checkCondition = function(condition, message) {
    if (!condition) {
        if (message === undefined || message===null) {
            message = "IllegalState";
        }
        throw (message);
    }
};

ATNDeserializer.prototype.readInt = function() {
    return this.data[this.pos++];
};

ATNDeserializer.prototype.readInt32 = function() {
    var low = this.readInt();
    var high = this.readInt();
    return low | (high << 16);
};

ATNDeserializer.prototype.readLong = function() {
    var low = this.readInt32();
    var high = this.readInt32();
    return (low & 0x00000000FFFFFFFF) | (high << 32);
};

function createByteToHex() {
	var bth = [];
	for (var i = 0; i < 256; i++) {
		bth[i] = (i + 0x100).toString(16).substr(1).toUpperCase();
	}
	return bth;
}

var byteToHex = createByteToHex();
	
ATNDeserializer.prototype.readUUID = function() {
	var bb = [];
	for(var i=7;i>=0;i--) {
		var int = this.readInt();
		bb[(2*i)+1] = int & 0xFF;
		bb[2*i] = (int >> 8) & 0xFF;
	}
    return byteToHex[bb[0]] + byteToHex[bb[1]] +
    byteToHex[bb[2]] + byteToHex[bb[3]] + '-' +
    byteToHex[bb[4]] + byteToHex[bb[5]] + '-' +
    byteToHex[bb[6]] + byteToHex[bb[7]] + '-' +
    byteToHex[bb[8]] + byteToHex[bb[9]] + '-' +
    byteToHex[bb[10]] + byteToHex[bb[11]] +
    byteToHex[bb[12]] + byteToHex[bb[13]] +
    byteToHex[bb[14]] + byteToHex[bb[15]];
};

ATNDeserializer.prototype.edgeFactory = function(atn, type, src, trg, arg1, arg2, arg3, sets) {
    var target = atn.states[trg];
    switch(type) {
    case Transition.EPSILON:
        return new EpsilonTransition(target);
    case Transition.RANGE:
        return arg3 !== 0 ? new RangeTransition(target, Token.EOF, arg2) : new RangeTransition(target, arg1, arg2);
    case Transition.RULE:
        return new RuleTransition(atn.states[arg1], arg2, arg3, target);
    case Transition.PREDICATE:
        return new PredicateTransition(target, arg1, arg2, arg3 !== 0);
    case Transition.PRECEDENCE:
        return new PrecedencePredicateTransition(target, arg1);
    case Transition.ATOM:
        return arg3 !== 0 ? new AtomTransition(target, Token.EOF) : new AtomTransition(target, arg1);
    case Transition.ACTION:
        return new ActionTransition(target, arg1, arg2, arg3 !== 0);
    case Transition.SET:
        return new SetTransition(target, sets[arg1]);
    case Transition.NOT_SET:
        return new NotSetTransition(target, sets[arg1]);
    case Transition.WILDCARD:
        return new WildcardTransition(target);
    default:
        throw "The specified transition type: " + type + " is not valid.";
    }
};

ATNDeserializer.prototype.stateFactory = function(type, ruleIndex) {
    if (this.stateFactories === null) {
        var sf = [];
        sf[ATNState.INVALID_TYPE] = null;
        sf[ATNState.BASIC] = function() { return new BasicState(); };
        sf[ATNState.RULE_START] = function() { return new RuleStartState(); };
        sf[ATNState.BLOCK_START] = function() { return new BasicBlockStartState(); };
        sf[ATNState.PLUS_BLOCK_START] = function() { return new PlusBlockStartState(); };
        sf[ATNState.STAR_BLOCK_START] = function() { return new StarBlockStartState(); };
        sf[ATNState.TOKEN_START] = function() { return new TokensStartState(); };
        sf[ATNState.RULE_STOP] = function() { return new RuleStopState(); };
        sf[ATNState.BLOCK_END] = function() { return new BlockEndState(); };
        sf[ATNState.STAR_LOOP_BACK] = function() { return new StarLoopbackState(); };
        sf[ATNState.STAR_LOOP_ENTRY] = function() { return new StarLoopEntryState(); };
        sf[ATNState.PLUS_LOOP_BACK] = function() { return new PlusLoopbackState(); };
        sf[ATNState.LOOP_END] = function() { return new LoopEndState(); };
        this.stateFactories = sf;
    }
    if (type>this.stateFactories.length || this.stateFactories[type] === null) {
        throw("The specified state type " + type + " is not valid.");
    } else {
        var s = this.stateFactories[type]();
        if (s!==null) {
            s.ruleIndex = ruleIndex;
            return s;
        }
    }
};

ATNDeserializer.prototype.lexerActionFactory = function(type, data1, data2) {
    if (this.actionFactories === null) {
        var af = [];
        af[LexerActionType.CHANNEL] = function(data1, data2) { return new LexerChannelAction(data1); };
        af[LexerActionType.CUSTOM] = function(data1, data2) { return new LexerCustomAction(data1, data2); };
        af[LexerActionType.MODE] = function(data1, data2) { return new LexerModeAction(data1); };
        af[LexerActionType.MORE] = function(data1, data2) { return LexerMoreAction.INSTANCE; };
        af[LexerActionType.POP_MODE] = function(data1, data2) { return LexerPopModeAction.INSTANCE; };
        af[LexerActionType.PUSH_MODE] = function(data1, data2) { return new LexerPushModeAction(data1); };
        af[LexerActionType.SKIP] = function(data1, data2) { return LexerSkipAction.INSTANCE; };
        af[LexerActionType.TYPE] = function(data1, data2) { return new LexerTypeAction(data1); };
        this.actionFactories = af;
    }
    if (type>this.actionFactories.length || this.actionFactories[type] === null) {
        throw("The specified lexer action type " + type + " is not valid.");
    } else {
        return this.actionFactories[type](data1, data2);
    }
};
   

exports.ATNDeserializer = ATNDeserializer;

});

define("ace/mode/cql/antlr4/Recognizer",["require","exports","module","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/error/ErrorListener","ace/mode/cql/antlr4/error/ErrorListener"], function(require, exports, module) {

var Token = require('./Token').Token;
var ConsoleErrorListener = require('./error/ErrorListener').ConsoleErrorListener;
var ProxyErrorListener = require('./error/ErrorListener').ProxyErrorListener;

function Recognizer() {
    this._listeners = [ ConsoleErrorListener.INSTANCE ];
    this._interp = null;
    this._stateNumber = -1;
    return this;
}

Recognizer.tokenTypeMapCache = {};
Recognizer.ruleIndexMapCache = {};


Recognizer.prototype.checkVersion = function(toolVersion) {
    var runtimeVersion = "4.5";
    if (runtimeVersion!==toolVersion) {
        console.log("ANTLR runtime and generated code versions disagree: "+runtimeVersion+"!="+toolVersion);
    }
};

Recognizer.prototype.addErrorListener = function(listener) {
    this._listeners.push(listener);
};

Recognizer.prototype.getTokenTypeMap = function() {
    var tokenNames = this.getTokenNames();
    if (tokenNames===null) {
        throw("The current recognizer does not provide a list of token names.");
    }
    var result = this.tokenTypeMapCache[tokenNames];
    if(result===undefined) {
        result = tokenNames.reduce(function(o, k, i) { o[k] = i; });
        result.EOF = Token.EOF;
        this.tokenTypeMapCache[tokenNames] = result;
    }
    return result;
};
Recognizer.prototype.getRuleIndexMap = function() {
    var ruleNames = this.getRuleNames();
    if (ruleNames===null) {
        throw("The current recognizer does not provide a list of rule names.");
    }
    var result = this.ruleIndexMapCache[ruleNames];
    if(result===undefined) {
        result = ruleNames.reduce(function(o, k, i) { o[k] = i; });
        this.ruleIndexMapCache[ruleNames] = result;
    }
    return result;
};

Recognizer.prototype.getTokenType = function(tokenName) {
    var ttype = this.getTokenTypeMap()[tokenName];
    if (ttype !==undefined) {
        return ttype;
    } else {
        return Token.INVALID_TYPE;
    }
};
Recognizer.prototype.getErrorHeader = function(e) {
    var line = e.getOffendingToken().line;
    var column = e.getOffendingToken().column;
    return "line " + line + ":" + column;
};
Recognizer.prototype.getTokenErrorDisplay = function(t) {
    if (t===null) {
        return "<no token>";
    }
    var s = t.text;
    if (s===null) {
        if (t.type===Token.EOF) {
            s = "<EOF>";
        } else {
            s = "<" + t.type + ">";
        }
    }
    s = s.replace("\n","\\n").replace("\r","\\r").replace("\t","\\t");
    return "'" + s + "'";
};

Recognizer.prototype.getErrorListenerDispatch = function() {
    return new ProxyErrorListener(this._listeners);
};
Recognizer.prototype.sempred = function(localctx, ruleIndex, actionIndex) {
    return true;
};

Recognizer.prototype.precpred = function(localctx , precedence) {
    return true;
};

Object.defineProperty(Recognizer.prototype, "state", {
	get : function() {
		return this._stateNumber;
	},
	set : function(state) {
		this._stateNumber = state;
	}
});


exports.Recognizer = Recognizer;
});

define("ace/mode/cql/antlr4/CommonTokenFactory",["require","exports","module","ace/mode/cql/antlr4/Token"], function(require, exports, module) {

var CommonToken = require('./Token').CommonToken;

function TokenFactory() {
	return this;
}

function CommonTokenFactory(copyText) {
	TokenFactory.call(this);
    this.copyText = copyText===undefined ? false : copyText;
	return this;
}

CommonTokenFactory.prototype = Object.create(TokenFactory.prototype);
CommonTokenFactory.prototype.constructor = CommonTokenFactory;
CommonTokenFactory.DEFAULT = new CommonTokenFactory();

CommonTokenFactory.prototype.create = function(source, type, text, channel, start, stop, line, column) {
    var t = new CommonToken(source, type, channel, start, stop);
    t.line = line;
    t.column = column;
    if (text !==null) {
        t.text = text;
    } else if (this.copyText && source[1] !==null) {
        t.text = source[1].getText(start,stop);
    }
    return t;
};

CommonTokenFactory.prototype.createThin = function(type, text) {
    var t = new CommonToken(null, type);
    t.text = text;
    return t;
};

exports.CommonTokenFactory = CommonTokenFactory;
});

define("ace/mode/cql/antlr4/Lexer",["require","exports","module","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/Recognizer","ace/mode/cql/antlr4/CommonTokenFactory","ace/mode/cql/antlr4/error/Errors"], function(require, exports, module) {

var Token = require('./Token').Token;
var Recognizer = require('./Recognizer').Recognizer;
var CommonTokenFactory = require('./CommonTokenFactory').CommonTokenFactory;
var LexerNoViableAltException = require('./error/Errors').LexerNoViableAltException;

function TokenSource() {
	return this;
}

function Lexer(input) {
	Recognizer.call(this);
	this._input = input;
	this._factory = CommonTokenFactory.DEFAULT;
	this._tokenFactorySourcePair = [ this, input ];

	this._interp = null; // child classes must populate this
	this._token = null;
	this._tokenStartCharIndex = -1;
	this._tokenStartLine = -1;
	this._tokenStartColumn = -1;
	this._hitEOF = false;
	this._channel = Token.DEFAULT_CHANNEL;
	this._type = Token.INVALID_TYPE;

	this._modeStack = [];
	this._mode = Lexer.DEFAULT_MODE;
	this._text = null;

	return this;
}

Lexer.prototype = Object.create(Recognizer.prototype);
Lexer.prototype.constructor = Lexer;

Lexer.DEFAULT_MODE = 0;
Lexer.MORE = -2;
Lexer.SKIP = -3;

Lexer.DEFAULT_TOKEN_CHANNEL = Token.DEFAULT_CHANNEL;
Lexer.HIDDEN = Token.HIDDEN_CHANNEL;
Lexer.MIN_CHAR_VALUE = '\u0000';
Lexer.MAX_CHAR_VALUE = '\uFFFE';

Lexer.prototype.reset = function() {
	if (this._input !== null) {
		this._input.seek(0); // rewind the input
	}
	this._token = null;
	this._type = Token.INVALID_TYPE;
	this._channel = Token.DEFAULT_CHANNEL;
	this._tokenStartCharIndex = -1;
	this._tokenStartColumn = -1;
	this._tokenStartLine = -1;
	this._text = null;

	this._hitEOF = false;
	this._mode = Lexer.DEFAULT_MODE;
	this._modeStack = [];

	this._interp.reset();
};
Lexer.prototype.nextToken = function() {
	if (this._input === null) {
		throw "nextToken requires a non-null input stream.";
	}
	var tokenStartMarker = this._input.mark();
	try {
		while (true) {
			if (this._hitEOF) {
				this.emitEOF();
				return this._token;
			}
			this._token = null;
			this._channel = Token.DEFAULT_CHANNEL;
			this._tokenStartCharIndex = this._input.index;
			this._tokenStartColumn = this._interp.column;
			this._tokenStartLine = this._interp.line;
			this._text = null;
			var continueOuter = false;
			while (true) {
				this._type = Token.INVALID_TYPE;
				var ttype = Lexer.SKIP;
				try {
					ttype = this._interp.match(this._input, this._mode);
				} catch (e) {
					this.notifyListeners(e); // report error
					this.recover(e);
				}
				if (this._input.LA(1) === Token.EOF) {
					this._hitEOF = true;
				}
				if (this._type === Token.INVALID_TYPE) {
					this._type = ttype;
				}
				if (this._type === Lexer.SKIP) {
					continueOuter = true;
					break;
				}
				if (this._type !== Lexer.MORE) {
					break;
				}
			}
			if (continueOuter) {
				continue;
			}
			if (this._token === null) {
				this.emit();
			}
			return this._token;
		}
	} finally {
		this._input.release(tokenStartMarker);
	}
};
Lexer.prototype.skip = function() {
	this._type = Lexer.SKIP;
};

Lexer.prototype.more = function() {
	this._type = Lexer.MORE;
};

Lexer.prototype.mode = function(m) {
	this._mode = m;
};

Lexer.prototype.pushMode = function(m) {
	if (this._interp.debug) {
		console.log("pushMode " + m);
	}
	this._modeStack.push(this._mode);
	this.mode(m);
};

Lexer.prototype.popMode = function() {
	if (this._modeStack.length === 0) {
		throw "Empty Stack";
	}
	if (this._interp.debug) {
		console.log("popMode back to " + this._modeStack.slice(0, -1));
	}
	this.mode(this._modeStack.pop());
	return this._mode;
};
Object.defineProperty(Lexer.prototype, "inputStream", {
	get : function() {
		return this._input;
	},
	set : function(input) {
		this._input = null;
		this._tokenFactorySourcePair = [ this, this._input ];
		this.reset();
		this._input = input;
		this._tokenFactorySourcePair = [ this, this._input ];
	}
});

Object.defineProperty(Lexer.prototype, "sourceName", {
	get : function sourceName() {
		return this._input.sourceName;
	}
});
Lexer.prototype.emitToken = function(token) {
	this._token = token;
};
Lexer.prototype.emit = function() {
	var t = this._factory.create(this._tokenFactorySourcePair, this._type,
			this._text, this._channel, this._tokenStartCharIndex, this
					.getCharIndex() - 1, this._tokenStartLine,
			this._tokenStartColumn);
	this.emitToken(t);
	return t;
};

Lexer.prototype.emitEOF = function() {
	var cpos = this.column;
	var lpos = this.line;
	var eof = this._factory.create(this._tokenFactorySourcePair, Token.EOF,
			null, Token.DEFAULT_CHANNEL, this._input.index,
			this._input.index - 1, lpos, cpos);
	this.emitToken(eof);
	return eof;
};

Object.defineProperty(Lexer.prototype, "type", {
	get : function() {
		return this.type;
	},
	set : function(type) {
		this._type = type;
	}
});

Object.defineProperty(Lexer.prototype, "line", {
	get : function() {
		return this._interp.line;
	},
	set : function(line) {
		this._interp.line = line;
	}
});

Object.defineProperty(Lexer.prototype, "column", {
	get : function() {
		return this._interp.column;
	},
	set : function(column) {
		this._interp.column = column;
	}
});
Lexer.prototype.getCharIndex = function() {
	return this._input.index;
};
Object.defineProperty(Lexer.prototype, "text", {
	get : function() {
		if (this._text !== null) {
			return this._text;
		} else {
			return this._interp.getText(this._input);
		}
	},
	set : function(text) {
		this._text = text;
	}
});
Lexer.prototype.getAllTokens = function() {
	var tokens = [];
	var t = this.nextToken();
	while (t.type !== Token.EOF) {
		tokens.push(t);
		t = this.nextToken();
	}
	return tokens;
};

Lexer.prototype.notifyListeners = function(e) {
	var start = this._tokenStartCharIndex;
	var stop = this._input.index;
	var text = this._input.getText(start, stop);
	var msg = "token recognition error at: '" + this.getErrorDisplay(text) + "'";
	var listener = this.getErrorListenerDispatch();
	listener.syntaxError(this, null, this._tokenStartLine,
			this._tokenStartColumn, msg, e);
};

Lexer.prototype.getErrorDisplay = function(s) {
	var d = [];
	for (var i = 0; i < s.length; i++) {
		d.push(s[i]);
	}
	return d.join('');
};

Lexer.prototype.getErrorDisplayForChar = function(c) {
	if (c.charCodeAt(0) === Token.EOF) {
		return "<EOF>";
	} else if (c === '\n') {
		return "\\n";
	} else if (c === '\t') {
		return "\\t";
	} else if (c === '\r') {
		return "\\r";
	} else {
		return c;
	}
};

Lexer.prototype.getCharErrorDisplay = function(c) {
	return "'" + this.getErrorDisplayForChar(c) + "'";
};
Lexer.prototype.recover = function(re) {
	if (this._input.LA(1) !== Token.EOF) {
		if (re instanceof LexerNoViableAltException) {
			this._interp.consume(this._input);
		} else {
			this._input.consume();
		}
	}
};

exports.Lexer = Lexer;
});

define("ace/mode/cql/antlr4/atn/ATNConfigSet",["require","exports","module","ace/mode/cql/antlr4/atn/ATN","ace/mode/cql/antlr4/Utils","ace/mode/cql/antlr4/atn/SemanticContext","ace/mode/cql/antlr4/PredictionContext"], function(require, exports, module) {

var ATN = require('./ATN').ATN;
var Utils = require('./../Utils');
var Set = Utils.Set;
var SemanticContext = require('./SemanticContext').SemanticContext;
var merge = require('./../PredictionContext').merge;

function hashATNConfig(c) {
	return c.shortHashString();
}

function equalATNConfigs(a, b) {
	if ( a===b ) {
		return true;
	}
	if ( a===null || b===null ) {
		return false;
	}
	return a.state.stateNumber===b.state.stateNumber &&
		a.alt===b.alt && a.semanticContext.equals(b.semanticContext);
}


function ATNConfigSet(fullCtx) {
	this.configLookup = new Set(hashATNConfig, equalATNConfigs);
	this.fullCtx = fullCtx === undefined ? true : fullCtx;
	this.readonly = false;
	this.configs = [];
	this.uniqueAlt = 0;
	this.conflictingAlts = null;
	this.hasSemanticContext = false;
	this.dipsIntoOuterContext = false;

	this.cachedHashString = "-1";

	return this;
}
ATNConfigSet.prototype.add = function(config, mergeCache) {
	if (mergeCache === undefined) {
		mergeCache = null;
	}
	if (this.readonly) {
		throw "This set is readonly";
	}
	if (config.semanticContext !== SemanticContext.NONE) {
		this.hasSemanticContext = true;
	}
	if (config.reachesIntoOuterContext > 0) {
		this.dipsIntoOuterContext = true;
	}
	var existing = this.configLookup.add(config);
	if (existing === config) {
		this.cachedHashString = "-1";
		this.configs.push(config); // track order here
		return true;
	}
	var rootIsWildcard = !this.fullCtx;
	var merged = merge(existing.context, config.context, rootIsWildcard, mergeCache);
	existing.reachesIntoOuterContext = Math.max( existing.reachesIntoOuterContext, config.reachesIntoOuterContext);
	if (config.precedenceFilterSuppressed) {
		existing.precedenceFilterSuppressed = true;
	}
	existing.context = merged; // replace context; no need to alt mapping
	return true;
};

ATNConfigSet.prototype.getStates = function() {
	var states = new Set();
	for (var i = 0; i < this.configs.length; i++) {
		states.add(this.configs[i].state);
	}
	return states;
};

ATNConfigSet.prototype.getPredicates = function() {
	var preds = [];
	for (var i = 0; i < this.configs.length; i++) {
		var c = this.configs[i].semanticContext;
		if (c !== SemanticContext.NONE) {
			preds.push(c.semanticContext);
		}
	}
	return preds;
};

Object.defineProperty(ATNConfigSet.prototype, "items", {
	get : function() {
		return this.configs;
	}
});

ATNConfigSet.prototype.optimizeConfigs = function(interpreter) {
	if (this.readonly) {
		throw "This set is readonly";
	}
	if (this.configLookup.length === 0) {
		return;
	}
	for (var i = 0; i < this.configs.length; i++) {
		var config = this.configs[i];
		config.context = interpreter.getCachedContext(config.context);
	}
};

ATNConfigSet.prototype.addAll = function(coll) {
	for (var i = 0; i < coll.length; i++) {
		this.add(coll[i]);
	}
	return false;
};

ATNConfigSet.prototype.equals = function(other) {
	if (this === other) {
		return true;
	} else if (!(other instanceof ATNConfigSet)) {
		return false;
	}
	return this.configs !== null && this.configs.equals(other.configs) &&
			this.fullCtx === other.fullCtx &&
			this.uniqueAlt === other.uniqueAlt &&
			this.conflictingAlts === other.conflictingAlts &&
			this.hasSemanticContext === other.hasSemanticContext &&
			this.dipsIntoOuterContext === other.dipsIntoOuterContext;
};

ATNConfigSet.prototype.hashString = function() {
	if (this.readonly) {
		if (this.cachedHashString === "-1") {
			this.cachedHashString = this.hashConfigs();
		}
		return this.cachedHashString;
	} else {
		return this.hashConfigs();
	}
};

ATNConfigSet.prototype.hashConfigs = function() {
	var s = "";
	this.configs.map(function(c) {
		s += c.toString();
	});
	return s;
};

Object.defineProperty(ATNConfigSet.prototype, "length", {
	get : function() {
		return this.configs.length;
	}
});

ATNConfigSet.prototype.isEmpty = function() {
	return this.configs.length === 0;
};

ATNConfigSet.prototype.contains = function(item) {
	if (this.configLookup === null) {
		throw "This method is not implemented for readonly sets.";
	}
	return this.configLookup.contains(item);
};

ATNConfigSet.prototype.containsFast = function(item) {
	if (this.configLookup === null) {
		throw "This method is not implemented for readonly sets.";
	}
	return this.configLookup.containsFast(item);
};

ATNConfigSet.prototype.clear = function() {
	if (this.readonly) {
		throw "This set is readonly";
	}
	this.configs = [];
	this.cachedHashString = "-1";
	this.configLookup = new Set();
};

ATNConfigSet.prototype.setReadonly = function(readonly) {
	this.readonly = readonly;
	if (readonly) {
		this.configLookup = null; // can't mod, no need for lookup cache
	}
};

ATNConfigSet.prototype.toString = function() {
	return Utils.arrayToString(this.configs) +
		(this.hasSemanticContext ? ",hasSemanticContext=" + this.hasSemanticContext : "") +
		(this.uniqueAlt !== ATN.INVALID_ALT_NUMBER ? ",uniqueAlt=" + this.uniqueAlt : "") +
		(this.conflictingAlts !== null ? ",conflictingAlts=" + this.conflictingAlts : "") +
		(this.dipsIntoOuterContext ? ",dipsIntoOuterContext" : "");
};

function OrderedATNConfigSet() {
	ATNConfigSet.call(this);
	this.configLookup = new Set();
	return this;
}

OrderedATNConfigSet.prototype = Object.create(ATNConfigSet.prototype);
OrderedATNConfigSet.prototype.constructor = OrderedATNConfigSet;

exports.ATNConfigSet = ATNConfigSet;
exports.OrderedATNConfigSet = OrderedATNConfigSet;
});

define("ace/mode/cql/antlr4/dfa/DFAState",["require","exports","module","ace/mode/cql/antlr4/atn/ATNConfigSet"], function(require, exports, module) {

var ATNConfigSet = require('./../atn/ATNConfigSet').ATNConfigSet;

function PredPrediction(pred, alt) {
	this.alt = alt;
	this.pred = pred;
	return this;
}

PredPrediction.prototype.toString = function() {
	return "(" + this.pred + ", " + this.alt + ")";
};

function DFAState(stateNumber, configs) {
	if (stateNumber === null) {
		stateNumber = -1;
	}
	if (configs === null) {
		configs = new ATNConfigSet();
	}
	this.stateNumber = stateNumber;
	this.configs = configs;
	this.edges = null;
	this.isAcceptState = false;
	this.prediction = 0;
	this.lexerActionExecutor = null;
	this.requiresFullContext = false;
	this.predicates = null;
	return this;
}
DFAState.prototype.getAltSet = function() {
	var alts = new Set();
	if (this.configs !== null) {
		for (var i = 0; i < this.configs.length; i++) {
			var c = this.configs[i];
			alts.add(c.alt);
		}
	}
	if (alts.length === 0) {
		return null;
	} else {
		return alts;
	}
};
DFAState.prototype.equals = function(other) {
	if (this === other) {
		return true;
	} else if (!(other instanceof DFAState)) {
		return false;
	} else {
		return this.configs.equals(other.configs);
	}
};

DFAState.prototype.toString = function() {
	return "" + this.stateNumber + ":" + this.hashString();
};

DFAState.prototype.hashString = function() {
	return "" +  this.configs +
			(this.isAcceptState ?
					"=>" + (this.predicates !== null ?
								this.predicates :
								this.prediction) :
					"");
};

exports.DFAState = DFAState;
exports.PredPrediction = PredPrediction;
});

define("ace/mode/cql/antlr4/atn/ATNSimulator",["require","exports","module","ace/mode/cql/antlr4/dfa/DFAState","ace/mode/cql/antlr4/atn/ATNConfigSet","ace/mode/cql/antlr4/PredictionContext"], function(require, exports, module) {

var DFAState = require('./../dfa/DFAState').DFAState;
var ATNConfigSet = require('./ATNConfigSet').ATNConfigSet;
var getCachedPredictionContext = require('./../PredictionContext').getCachedPredictionContext;

function ATNSimulator(atn, sharedContextCache) {
    this.atn = atn;
    this.sharedContextCache = sharedContextCache;
    return this;
}
ATNSimulator.ERROR = new DFAState(0x7FFFFFFF, new ATNConfigSet());


ATNSimulator.prototype.getCachedContext = function(context) {
    if (this.sharedContextCache ===null) {
        return context;
    }
    var visited = {};
    return getCachedPredictionContext(context, this.sharedContextCache, visited);
};

exports.ATNSimulator = ATNSimulator;

});

define("ace/mode/cql/antlr4/atn/LexerActionExecutor",["require","exports","module","ace/mode/cql/antlr4/atn/LexerAction"], function(require, exports, module) {

var LexerIndexedCustomAction = require('./LexerAction').LexerIndexedCustomAction;

function LexerActionExecutor(lexerActions) {
	this.lexerActions = lexerActions === null ? [] : lexerActions;
	this.hashString = lexerActions.toString(); // "".join([str(la) for la in
	return this;
}
LexerActionExecutor.append = function(lexerActionExecutor, lexerAction) {
	if (lexerActionExecutor === null) {
		return new LexerActionExecutor([ lexerAction ]);
	}
	var lexerActions = lexerActionExecutor.lexerActions.concat([ lexerAction ]);
	return new LexerActionExecutor(lexerActions);
};
LexerActionExecutor.prototype.fixOffsetBeforeMatch = function(offset) {
	var updatedLexerActions = null;
	for (var i = 0; i < this.lexerActions.length; i++) {
		if (this.lexerActions[i].isPositionDependent &&
				!(this.lexerActions[i] instanceof LexerIndexedCustomAction)) {
			if (updatedLexerActions === null) {
				updatedLexerActions = this.lexerActions.concat([]);
			}
			updatedLexerActions[i] = new LexerIndexedCustomAction(offset,
					this.lexerActions[i]);
		}
	}
	if (updatedLexerActions === null) {
		return this;
	} else {
		return new LexerActionExecutor(updatedLexerActions);
	}
};
LexerActionExecutor.prototype.execute = function(lexer, input, startIndex) {
	var requiresSeek = false;
	var stopIndex = input.index;
	try {
		for (var i = 0; i < this.lexerActions.length; i++) {
			var lexerAction = this.lexerActions[i];
			if (lexerAction instanceof LexerIndexedCustomAction) {
				var offset = lexerAction.offset;
				input.seek(startIndex + offset);
				lexerAction = lexerAction.action;
				requiresSeek = (startIndex + offset) !== stopIndex;
			} else if (lexerAction.isPositionDependent) {
				input.seek(stopIndex);
				requiresSeek = false;
			}
			lexerAction.execute(lexer);
		}
	} finally {
		if (requiresSeek) {
			input.seek(stopIndex);
		}
	}
};

LexerActionExecutor.prototype.hashString = function() {
	return this.hashString;
};

LexerActionExecutor.prototype.equals = function(other) {
	if (this === other) {
		return true;
	} else if (!(other instanceof LexerActionExecutor)) {
		return false;
	} else {
		return this.hashString === other.hashString &&
				this.lexerActions === other.lexerActions;
	}
};

exports.LexerActionExecutor = LexerActionExecutor;
});

define("ace/mode/cql/antlr4/atn/LexerATNSimulator",["require","exports","module","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/Lexer","ace/mode/cql/antlr4/atn/ATN","ace/mode/cql/antlr4/atn/ATNSimulator","ace/mode/cql/antlr4/dfa/DFAState","ace/mode/cql/antlr4/atn/ATNConfigSet","ace/mode/cql/antlr4/atn/ATNConfigSet","ace/mode/cql/antlr4/PredictionContext","ace/mode/cql/antlr4/PredictionContext","ace/mode/cql/antlr4/atn/ATNState","ace/mode/cql/antlr4/atn/ATNConfig","ace/mode/cql/antlr4/atn/Transition","ace/mode/cql/antlr4/atn/LexerActionExecutor","ace/mode/cql/antlr4/error/Errors"], function(require, exports, module) {

var Token = require('./../Token').Token;
var Lexer = require('./../Lexer').Lexer;
var ATN = require('./ATN').ATN;
var ATNSimulator = require('./ATNSimulator').ATNSimulator;
var DFAState = require('./../dfa/DFAState').DFAState;
var ATNConfigSet = require('./ATNConfigSet').ATNConfigSet;
var OrderedATNConfigSet = require('./ATNConfigSet').OrderedATNConfigSet;
var PredictionContext = require('./../PredictionContext').PredictionContext;
var SingletonPredictionContext = require('./../PredictionContext').SingletonPredictionContext;
var RuleStopState = require('./ATNState').RuleStopState;
var LexerATNConfig = require('./ATNConfig').LexerATNConfig;
var Transition = require('./Transition').Transition;
var LexerActionExecutor = require('./LexerActionExecutor').LexerActionExecutor;
var LexerNoViableAltException = require('./../error/Errors').LexerNoViableAltException;

function resetSimState(sim) {
	sim.index = -1;
	sim.line = 0;
	sim.column = -1;
	sim.dfaState = null;
}

function SimState() {
	resetSimState(this);
	return this;
}

SimState.prototype.reset = function() {
	resetSimState(this);
};

function LexerATNSimulator(recog, atn, decisionToDFA, sharedContextCache) {
	ATNSimulator.call(this, atn, sharedContextCache);
	this.decisionToDFA = decisionToDFA;
	this.recog = recog;
	this.startIndex = -1;
	this.line = 1;
	this.column = 0;
	this.mode = Lexer.DEFAULT_MODE;
	this.prevAccept = new SimState();
	return this;
}

LexerATNSimulator.prototype = Object.create(ATNSimulator.prototype);
LexerATNSimulator.prototype.constructor = LexerATNSimulator;

LexerATNSimulator.debug = false;
LexerATNSimulator.dfa_debug = false;

LexerATNSimulator.MIN_DFA_EDGE = 0;
LexerATNSimulator.MAX_DFA_EDGE = 127; // forces unicode to stay in ATN

LexerATNSimulator.match_calls = 0;

LexerATNSimulator.prototype.copyState = function(simulator) {
	this.column = simulator.column;
	this.line = simulator.line;
	this.mode = simulator.mode;
	this.startIndex = simulator.startIndex;
};

LexerATNSimulator.prototype.match = function(input, mode) {
	this.match_calls += 1;
	this.mode = mode;
	var mark = input.mark();
	try {
		this.startIndex = input.index;
		this.prevAccept.reset();
		var dfa = this.decisionToDFA[mode];
		if (dfa.s0 === null) {
			return this.matchATN(input);
		} else {
			return this.execATN(input, dfa.s0);
		}
	} finally {
		input.release(mark);
	}
};

LexerATNSimulator.prototype.reset = function() {
	this.prevAccept.reset();
	this.startIndex = -1;
	this.line = 1;
	this.column = 0;
	this.mode = Lexer.DEFAULT_MODE;
};

LexerATNSimulator.prototype.matchATN = function(input) {
	var startState = this.atn.modeToStartState[this.mode];

	if (this.debug) {
		console.log("matchATN mode " + this.mode + " start: " + startState);
	}
	var old_mode = this.mode;
	var s0_closure = this.computeStartState(input, startState);
	var suppressEdge = s0_closure.hasSemanticContext;
	s0_closure.hasSemanticContext = false;

	var next = this.addDFAState(s0_closure);
	if (!suppressEdge) {
		this.decisionToDFA[this.mode].s0 = next;
	}

	var predict = this.execATN(input, next);

	if (this.debug) {
		console.log("DFA after matchATN: " + this.decisionToDFA[old_mode].toLexerString());
	}
	return predict;
};

LexerATNSimulator.prototype.execATN = function(input, ds0) {
	if (this.debug) {
		console.log("start state closure=" + ds0.configs);
	}
	if (ds0.isAcceptState) {
		this.captureSimState(this.prevAccept, input, ds0);
	}
	var t = input.LA(1);
	var s = ds0; // s is current/from DFA state

	while (true) { // while more work
		if (this.debug) {
			console.log("execATN loop starting closure: " + s.configs);
		}
		var target = this.getExistingTargetState(s, t);
		if (target === null) {
			target = this.computeTargetState(input, s, t);
		}
		if (target === ATNSimulator.ERROR) {
			break;
		}
		if (t !== Token.EOF) {
			this.consume(input);
		}
		if (target.isAcceptState) {
			this.captureSimState(this.prevAccept, input, target);
			if (t === Token.EOF) {
				break;
			}
		}
		t = input.LA(1);
		s = target; // flip; current DFA target becomes new src/from state
	}
	return this.failOrAccept(this.prevAccept, input, s.configs, t);
};
LexerATNSimulator.prototype.getExistingTargetState = function(s, t) {
	if (s.edges === null || t < LexerATNSimulator.MIN_DFA_EDGE || t > LexerATNSimulator.MAX_DFA_EDGE) {
		return null;
	}

	var target = s.edges[t - LexerATNSimulator.MIN_DFA_EDGE];
	if(target===undefined) {
		target = null;
	}
	if (this.debug && target !== null) {
		console.log("reuse state " + s.stateNumber + " edge to " + target.stateNumber);
	}
	return target;
};
LexerATNSimulator.prototype.computeTargetState = function(input, s, t) {
	var reach = new OrderedATNConfigSet();
	this.getReachableConfigSet(input, s.configs, reach, t);

	if (reach.items.length === 0) { // we got nowhere on t from s
		if (!reach.hasSemanticContext) {
			this.addDFAEdge(s, t, ATNSimulator.ERROR);
		}
		return ATNSimulator.ERROR;
	}
	return this.addDFAEdge(s, t, null, reach);
};

LexerATNSimulator.prototype.failOrAccept = function(prevAccept, input, reach, t) {
	if (this.prevAccept.dfaState !== null) {
		var lexerActionExecutor = prevAccept.dfaState.lexerActionExecutor;
		this.accept(input, lexerActionExecutor, this.startIndex,
				prevAccept.index, prevAccept.line, prevAccept.column);
		return prevAccept.dfaState.prediction;
	} else {
		if (t === Token.EOF && input.index === this.startIndex) {
			return Token.EOF;
		}
		throw new LexerNoViableAltException(this.recog, input, this.startIndex, reach);
	}
};
LexerATNSimulator.prototype.getReachableConfigSet = function(input, closure,
		reach, t) {
	var skipAlt = ATN.INVALID_ALT_NUMBER;
	for (var i = 0; i < closure.items.length; i++) {
		var cfg = closure.items[i];
		var currentAltReachedAcceptState = (cfg.alt === skipAlt);
		if (currentAltReachedAcceptState && cfg.passedThroughNonGreedyDecision) {
			continue;
		}
		if (this.debug) {
			console.log("testing %s at %s\n", this.getTokenName(t), cfg
					.toString(this.recog, true));
		}
		for (var j = 0; j < cfg.state.transitions.length; j++) {
			var trans = cfg.state.transitions[j]; // for each transition
			var target = this.getReachableTarget(trans, t);
			if (target !== null) {
				var lexerActionExecutor = cfg.lexerActionExecutor;
				if (lexerActionExecutor !== null) {
					lexerActionExecutor = lexerActionExecutor.fixOffsetBeforeMatch(input.index - this.startIndex);
				}
				var treatEofAsEpsilon = (t === Token.EOF);
				var config = new LexerATNConfig({state:target, lexerActionExecutor:lexerActionExecutor}, cfg);
				if (this.closure(input, config, reach,
						currentAltReachedAcceptState, true, treatEofAsEpsilon)) {
					skipAlt = cfg.alt;
				}
			}
		}
	}
};

LexerATNSimulator.prototype.accept = function(input, lexerActionExecutor,
		startIndex, index, line, charPos) {
	if (this.debug) {
		console.log("ACTION %s\n", lexerActionExecutor);
	}
	input.seek(index);
	this.line = line;
	this.column = charPos;
	if (lexerActionExecutor !== null && this.recog !== null) {
		lexerActionExecutor.execute(this.recog, input, startIndex);
	}
};

LexerATNSimulator.prototype.getReachableTarget = function(trans, t) {
	if (trans.matches(t, 0, 0xFFFE)) {
		return trans.target;
	} else {
		return null;
	}
};

LexerATNSimulator.prototype.computeStartState = function(input, p) {
	var initialContext = PredictionContext.EMPTY;
	var configs = new OrderedATNConfigSet();
	for (var i = 0; i < p.transitions.length; i++) {
		var target = p.transitions[i].target;
        var cfg = new LexerATNConfig({state:target, alt:i+1, context:initialContext}, null);
		this.closure(input, cfg, configs, false, false, false);
	}
	return configs;
};
LexerATNSimulator.prototype.closure = function(input, config, configs,
		currentAltReachedAcceptState, speculative, treatEofAsEpsilon) {
	var cfg = null;
	if (this.debug) {
		console.log("closure(" + config.toString(this.recog, true) + ")");
	}
	if (config.state instanceof RuleStopState) {
		if (this.debug) {
			if (this.recog !== null) {
				console.log("closure at %s rule stop %s\n", this.recog.getRuleNames()[config.state.ruleIndex], config);
			} else {
				console.log("closure at rule stop %s\n", config);
			}
		}
		if (config.context === null || config.context.hasEmptyPath()) {
			if (config.context === null || config.context.isEmpty()) {
				configs.add(config);
				return true;
			} else {
				configs.add(new LexerATNConfig({ state:config.state, context:PredictionContext.EMPTY}, config));
				currentAltReachedAcceptState = true;
			}
		}
		if (config.context !== null && !config.context.isEmpty()) {
			for (var i = 0; i < config.context.length; i++) {
				if (config.context.getReturnState(i) !== PredictionContext.EMPTY_RETURN_STATE) {
					var newContext = config.context.getParent(i); // "pop" return state
					var returnState = this.atn.states[config.context.getReturnState(i)];
					cfg = new LexerATNConfig({ state:returnState, context:newContext }, config);
					currentAltReachedAcceptState = this.closure(input, cfg,
							configs, currentAltReachedAcceptState, speculative,
							treatEofAsEpsilon);
				}
			}
		}
		return currentAltReachedAcceptState;
	}
	if (!config.state.epsilonOnlyTransitions) {
		if (!currentAltReachedAcceptState || !config.passedThroughNonGreedyDecision) {
			configs.add(config);
		}
	}
	for (var j = 0; j < config.state.transitions.length; j++) {
		var trans = config.state.transitions[j];
		cfg = this.getEpsilonTarget(input, config, trans, configs, speculative, treatEofAsEpsilon);
		if (cfg !== null) {
			currentAltReachedAcceptState = this.closure(input, cfg, configs,
					currentAltReachedAcceptState, speculative, treatEofAsEpsilon);
		}
	}
	return currentAltReachedAcceptState;
};
LexerATNSimulator.prototype.getEpsilonTarget = function(input, config, trans,
		configs, speculative, treatEofAsEpsilon) {
	var cfg = null;
	if (trans.serializationType === Transition.RULE) {
		var newContext = SingletonPredictionContext.create(config.context, trans.followState.stateNumber);
		cfg = new LexerATNConfig( { state:trans.target, context:newContext}, config);
	} else if (trans.serializationType === Transition.PRECEDENCE) {
		throw "Precedence predicates are not supported in lexers.";
	} else if (trans.serializationType === Transition.PREDICATE) {

		if (this.debug) {
			console.log("EVAL rule " + trans.ruleIndex + ":" + trans.predIndex);
		}
		configs.hasSemanticContext = true;
		if (this.evaluatePredicate(input, trans.ruleIndex, trans.predIndex, speculative)) {
			cfg = new LexerATNConfig({ state:trans.target}, config);
		}
	} else if (trans.serializationType === Transition.ACTION) {
		if (config.context === null || config.context.hasEmptyPath()) {
			var lexerActionExecutor = LexerActionExecutor.append(config.lexerActionExecutor,
					this.atn.lexerActions[trans.actionIndex]);
			cfg = new LexerATNConfig({ state:trans.target, lexerActionExecutor:lexerActionExecutor }, config);
		} else {
			cfg = new LexerATNConfig( { state:trans.target}, config);
		}
	} else if (trans.serializationType === Transition.EPSILON) {
		cfg = new LexerATNConfig({ state:trans.target}, config);
	} else if (trans.serializationType === Transition.ATOM ||
				trans.serializationType === Transition.RANGE ||
				trans.serializationType === Transition.SET) {
		if (treatEofAsEpsilon) {
			if (trans.matches(Token.EOF, 0, 0xFFFF)) {
				cfg = new LexerATNConfig( { state:trans.target }, config);
			}
		}
	}
	return cfg;
};
LexerATNSimulator.prototype.evaluatePredicate = function(input, ruleIndex,
		predIndex, speculative) {
	if (this.recog === null) {
		return true;
	}
	if (!speculative) {
		return this.recog.sempred(null, ruleIndex, predIndex);
	}
	var savedcolumn = this.column;
	var savedLine = this.line;
	var index = input.index;
	var marker = input.mark();
	try {
		this.consume(input);
		return this.recog.sempred(null, ruleIndex, predIndex);
	} finally {
		this.column = savedcolumn;
		this.line = savedLine;
		input.seek(index);
		input.release(marker);
	}
};

LexerATNSimulator.prototype.captureSimState = function(settings, input, dfaState) {
	settings.index = input.index;
	settings.line = this.line;
	settings.column = this.column;
	settings.dfaState = dfaState;
};

LexerATNSimulator.prototype.addDFAEdge = function(from_, tk, to, cfgs) {
	if (to === undefined) {
		to = null;
	}
	if (cfgs === undefined) {
		cfgs = null;
	}
	if (to === null && cfgs !== null) {
		var suppressEdge = cfgs.hasSemanticContext;
		cfgs.hasSemanticContext = false;

		to = this.addDFAState(cfgs);

		if (suppressEdge) {
			return to;
		}
	}
	if (tk < LexerATNSimulator.MIN_DFA_EDGE || tk > LexerATNSimulator.MAX_DFA_EDGE) {
		return to;
	}
	if (this.debug) {
		console.log("EDGE " + from_ + " -> " + to + " upon " + tk);
	}
	if (from_.edges === null) {
		from_.edges = [];
	}
	from_.edges[tk - LexerATNSimulator.MIN_DFA_EDGE] = to; // connect

	return to;
};
LexerATNSimulator.prototype.addDFAState = function(configs) {
	var proposed = new DFAState(null, configs);
	var firstConfigWithRuleStopState = null;
	for (var i = 0; i < configs.items.length; i++) {
		var cfg = configs.items[i];
		if (cfg.state instanceof RuleStopState) {
			firstConfigWithRuleStopState = cfg;
			break;
		}
	}
	if (firstConfigWithRuleStopState !== null) {
		proposed.isAcceptState = true;
		proposed.lexerActionExecutor = firstConfigWithRuleStopState.lexerActionExecutor;
		proposed.prediction = this.atn.ruleToTokenType[firstConfigWithRuleStopState.state.ruleIndex];
	}
	var hash = proposed.hashString();
	var dfa = this.decisionToDFA[this.mode];
	var existing = dfa.states[hash] || null;
	if (existing!==null) {
		return existing;
	}
	var newState = proposed;
	newState.stateNumber = dfa.states.length;
	configs.setReadonly(true);
	newState.configs = configs;
	dfa.states[hash] = newState;
	return newState;
};

LexerATNSimulator.prototype.getDFA = function(mode) {
	return this.decisionToDFA[mode];
};
LexerATNSimulator.prototype.getText = function(input) {
	return input.getText(this.startIndex, input.index - 1);
};

LexerATNSimulator.prototype.consume = function(input) {
	var curChar = input.LA(1);
	if (curChar === "\n".charCodeAt(0)) {
		this.line += 1;
		this.column = 0;
	} else {
		this.column += 1;
	}
	input.consume();
};

LexerATNSimulator.prototype.getTokenName = function(tt) {
	if (tt === -1) {
		return "EOF";
	} else {
		return "'" + String.fromCharCode(tt) + "'";
	}
};

exports.LexerATNSimulator = LexerATNSimulator;
});

define("ace/mode/cql/antlr4/atn/PredictionMode",["require","exports","module","ace/mode/cql/antlr4/Utils","ace/mode/cql/antlr4/Utils","ace/mode/cql/antlr4/Utils","ace/mode/cql/antlr4/atn/ATN","ace/mode/cql/antlr4/atn/ATNState"], function(require, exports, module) {

var Set = require('./../Utils').Set;
var BitSet = require('./../Utils').BitSet;
var AltDict = require('./../Utils').AltDict;
var ATN = require('./ATN').ATN;
var RuleStopState = require('./ATNState').RuleStopState;

function PredictionMode() {
	return this;
}
PredictionMode.SLL = 0;
PredictionMode.LL = 1;
PredictionMode.LL_EXACT_AMBIG_DETECTION = 2;
PredictionMode.hasSLLConflictTerminatingPrediction = function( mode, configs) {
    if (PredictionMode.allConfigsInRuleStopStates(configs)) {
        return true;
    }
    if (mode === PredictionMode.SLL) {
        if (configs.hasSemanticContext) {
            var dup = new ATNConfigSet();
            for(var i=0;i<configs.items.length;i++) {
            	var c = configs.items[i];
                c = new ATNConfig({semanticContext:SemanticContext.NONE}, c);
                dup.add(c);
            }
            configs = dup;
        }
    }
    var altsets = PredictionMode.getConflictingAltSubsets(configs);
    return PredictionMode.hasConflictingAltSet(altsets) && !PredictionMode.hasStateAssociatedWithOneAlt(configs);
};
PredictionMode.hasConfigInRuleStopState = function(configs) {
	for(var i=0;i<configs.items.length;i++) {
		var c = configs.items[i];
        if (c.state instanceof RuleStopState) {
            return true;
        }
	}
    return false;
};
PredictionMode.allConfigsInRuleStopStates = function(configs) {
	for(var i=0;i<configs.items.length;i++) {
		var c = configs.items[i];
        if (!(c.state instanceof RuleStopState)) {
            return false;
        }
	}
    return true;
};
PredictionMode.resolvesToJustOneViableAlt = function(altsets) {
    return PredictionMode.getSingleViableAlt(altsets);
};
PredictionMode.allSubsetsConflict = function(altsets) {
    return ! PredictionMode.hasNonConflictingAltSet(altsets);
};
PredictionMode.hasNonConflictingAltSet = function(altsets) {
	for(var i=0;i<altsets.length;i++) {
		var alts = altsets[i];
        if (alts.length===1) {
            return true;
        }
	}
    return false;
};
PredictionMode.hasConflictingAltSet = function(altsets) {
	for(var i=0;i<altsets.length;i++) {
		var alts = altsets[i];
        if (alts.length>1) {
            return true;
        }
	}
    return false;
};
PredictionMode.allSubsetsEqual = function(altsets) {
    var first = null;
	for(var i=0;i<altsets.length;i++) {
		var alts = altsets[i];
        if (first === null) {
            first = alts;
        } else if (alts!==first) {
            return false;
        }
	}
    return true;
};
PredictionMode.getUniqueAlt = function(altsets) {
    var all = PredictionMode.getAlts(altsets);
    if (all.length===1) {
        return all.minValue();
    } else {
        return ATN.INVALID_ALT_NUMBER;
    }
};
PredictionMode.getAlts = function(altsets) {
    var all = new BitSet();
    altsets.map( function(alts) { all.or(alts); });
    return all;
};
PredictionMode.getConflictingAltSubsets = function(configs) {
    var configToAlts = {};
	for(var i=0;i<configs.items.length;i++) {
		var c = configs.items[i];
        var key = "key_" + c.state.stateNumber + "/" + c.context;
        var alts = configToAlts[key] || null;
        if (alts === null) {
            alts = new BitSet();
            configToAlts[key] = alts;
        }
        alts.add(c.alt);
	}
	var values = [];
	for(var k in configToAlts) {
		if(k.indexOf("key_")!==0) {
			continue;
		}
		values.push(configToAlts[k]);
	}
    return values;
};
PredictionMode.getStateToAltMap = function(configs) {
    var m = new AltDict();
    configs.items.map(function(c) {
        var alts = m.get(c.state);
        if (alts === null) {
            alts = new BitSet();
            m.put(c.state, alts);
        }
        alts.add(c.alt);
    });
    return m;
};

PredictionMode.hasStateAssociatedWithOneAlt = function(configs) {
    var values = PredictionMode.getStateToAltMap(configs).values();
    for(var i=0;i<values.length;i++) {
        if (values[i].length===1) {
            return true;
        }
    }
    return false;
};

PredictionMode.getSingleViableAlt = function(altsets) {
    var result = null;
	for(var i=0;i<altsets.length;i++) {
		var alts = altsets[i];
        var minAlt = alts.minValue();
        if(result===null) {
            result = minAlt;
        } else if(result!==minAlt) { // more than 1 viable alt
            return ATN.INVALID_ALT_NUMBER;
        }
	}
    return result;
};

exports.PredictionMode = PredictionMode;
});

define("ace/mode/cql/antlr4/atn/ParserATNSimulator",["require","exports","module","ace/mode/cql/antlr4/Utils","ace/mode/cql/antlr4/atn/ATN","ace/mode/cql/antlr4/atn/ATNConfig","ace/mode/cql/antlr4/atn/ATNConfigSet","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/dfa/DFAState","ace/mode/cql/antlr4/dfa/DFAState","ace/mode/cql/antlr4/atn/ATNSimulator","ace/mode/cql/antlr4/atn/PredictionMode","ace/mode/cql/antlr4/RuleContext","ace/mode/cql/antlr4/ParserRuleContext","ace/mode/cql/antlr4/atn/SemanticContext","ace/mode/cql/antlr4/atn/ATNState","ace/mode/cql/antlr4/atn/ATNState","ace/mode/cql/antlr4/PredictionContext","ace/mode/cql/antlr4/IntervalSet","ace/mode/cql/antlr4/atn/Transition","ace/mode/cql/antlr4/error/Errors","ace/mode/cql/antlr4/PredictionContext","ace/mode/cql/antlr4/PredictionContext"], function(require, exports, module) {

var Utils = require('./../Utils');
var Set = Utils.Set;
var BitSet = Utils.BitSet;
var DoubleDict = Utils.DoubleDict;
var ATN = require('./ATN').ATN;
var ATNConfig = require('./ATNConfig').ATNConfig;
var ATNConfigSet = require('./ATNConfigSet').ATNConfigSet;
var Token = require('./../Token').Token;
var DFAState = require('./../dfa/DFAState').DFAState;
var PredPrediction = require('./../dfa/DFAState').PredPrediction;
var ATNSimulator = require('./ATNSimulator').ATNSimulator;
var PredictionMode = require('./PredictionMode').PredictionMode;
var RuleContext = require('./../RuleContext').RuleContext;
var ParserRuleContext = require('./../ParserRuleContext').ParserRuleContext;
var SemanticContext = require('./SemanticContext').SemanticContext;
var StarLoopEntryState = require('./ATNState').StarLoopEntryState;
var RuleStopState = require('./ATNState').RuleStopState;
var PredictionContext = require('./../PredictionContext').PredictionContext;
var Interval = require('./../IntervalSet').Interval;
var Transitions = require('./Transition');
var Transition = Transitions.Transition;
var SetTransition = Transitions.SetTransition;
var NotSetTransition = Transitions.NotSetTransition;
var RuleTransition = Transitions.RuleTransition;
var ActionTransition = Transitions.ActionTransition;
var NoViableAltException = require('./../error/Errors').NoViableAltException;

var SingletonPredictionContext = require('./../PredictionContext').SingletonPredictionContext;
var predictionContextFromRuleContext = require('./../PredictionContext').predictionContextFromRuleContext;

function ParserATNSimulator(parser, atn, decisionToDFA, sharedContextCache) {
	ATNSimulator.call(this, atn, sharedContextCache);
    this.parser = parser;
    this.decisionToDFA = decisionToDFA;
    this.predictionMode = PredictionMode.LL;
    this._input = null;
    this._startIndex = 0;
    this._outerContext = null;
    this._dfa = null;
    this.mergeCache = null;
    return this;
}

ParserATNSimulator.prototype = Object.create(ATNSimulator.prototype);
ParserATNSimulator.prototype.constructor = ParserATNSimulator;

ParserATNSimulator.prototype.debug = false;
ParserATNSimulator.prototype.debug_list_atn_decisions = false;
ParserATNSimulator.prototype.dfa_debug = false;
ParserATNSimulator.prototype.retry_debug = false;


ParserATNSimulator.prototype.reset = function() {
};

ParserATNSimulator.prototype.adaptivePredict = function(input, decision, outerContext) {
    if (this.debug || this.debug_list_atn_decisions) {
        console.log("adaptivePredict decision " + decision +
                               " exec LA(1)==" + this.getLookaheadName(input) +
                               " line " + input.LT(1).line + ":" +
                               input.LT(1).column);
    }
    this._input = input;
    this._startIndex = input.index;
    this._outerContext = outerContext;
    
    var dfa = this.decisionToDFA[decision];
    this._dfa = dfa;
    var m = input.mark();
    var index = input.index;
    try {
        var s0;
        if (dfa.precedenceDfa) {
            s0 = dfa.getPrecedenceStartState(this.parser.getPrecedence());
        } else {
            s0 = dfa.s0;
        }
        if (s0===null) {
            if (outerContext===null) {
                outerContext = RuleContext.EMPTY;
            }
            if (this.debug || this.debug_list_atn_decisions) {
                console.log("predictATN decision " + dfa.decision +
                                   " exec LA(1)==" + this.getLookaheadName(input) +
                                   ", outerContext=" + outerContext.toString(this.parser.ruleNames));
            }
            if (!dfa.precedenceDfa && (dfa.atnStartState instanceof StarLoopEntryState)) {
                if (dfa.atnStartState.precedenceRuleDecision) {
                    dfa.setPrecedenceDfa(true);
                }
            }
            var fullCtx = false;
            var s0_closure = this.computeStartState(dfa.atnStartState, RuleContext.EMPTY, fullCtx);

            if( dfa.precedenceDfa) {
                s0_closure = this.applyPrecedenceFilter(s0_closure);
                s0 = this.addDFAState(dfa, new DFAState(null, s0_closure));
                dfa.setPrecedenceStartState(this.parser.getPrecedence(), s0);
            } else {
                s0 = this.addDFAState(dfa, new DFAState(null, s0_closure));
                dfa.s0 = s0;
            }
        }
        var alt = this.execATN(dfa, s0, input, index, outerContext);
        if (this.debug) {
            console.log("DFA after predictATN: " + dfa.toString(this.parser.literalNames));
        }
        return alt;
    } finally {
        this._dfa = null;
        this.mergeCache = null; // wack cache after each prediction
        input.seek(index);
        input.release(m);
    }
};
ParserATNSimulator.prototype.execATN = function(dfa, s0, input, startIndex, outerContext ) {
    if (this.debug || this.debug_list_atn_decisions) {
        console.log("execATN decision " + dfa.decision +
                " exec LA(1)==" + this.getLookaheadName(input) +
                " line " + input.LT(1).line + ":" + input.LT(1).column);
    }
    var alt;
    var previousD = s0;

    if (this.debug) {
        console.log("s0 = " + s0);
    }
    var t = input.LA(1);
    while(true) { // while more work
        var D = this.getExistingTargetState(previousD, t);
        if(D===null) {
            D = this.computeTargetState(dfa, previousD, t);
        }
        if(D===ATNSimulator.ERROR) {
            var e = this.noViableAlt(input, outerContext, previousD.configs, startIndex);
            input.seek(startIndex);
            alt = this.getSynValidOrSemInvalidAltThatFinishedDecisionEntryRule(previousD.configs, outerContext);
            if(alt!==ATN.INVALID_ALT_NUMBER) {
                return alt;
            } else {
                throw e;
            }
        }
        if(D.requiresFullContext && this.predictionMode !== PredictionMode.SLL) {
            var conflictingAlts = null;
            if (D.predicates!==null) {
                if (this.debug) {
                    console.log("DFA state has preds in DFA sim LL failover");
                }
                var conflictIndex = input.index;
                if(conflictIndex !== startIndex) {
                    input.seek(startIndex);
                }
                conflictingAlts = this.evalSemanticContext(D.predicates, outerContext, true);
                if (conflictingAlts.length===1) {
                    if(this.debug) {
                        console.log("Full LL avoided");
                    }
                    return conflictingAlts.minValue();
                }
                if (conflictIndex !== startIndex) {
                    input.seek(conflictIndex);
                }
            }
            if (this.dfa_debug) {
                console.log("ctx sensitive state " + outerContext +" in " + D);
            }
            var fullCtx = true;
            var s0_closure = this.computeStartState(dfa.atnStartState, outerContext, fullCtx);
            this.reportAttemptingFullContext(dfa, conflictingAlts, D.configs, startIndex, input.index);
            alt = this.execATNWithFullContext(dfa, D, s0_closure, input, startIndex, outerContext);
            return alt;
        }
        if (D.isAcceptState) {
            if (D.predicates===null) {
                return D.prediction;
            }
            var stopIndex = input.index;
            input.seek(startIndex);
            var alts = this.evalSemanticContext(D.predicates, outerContext, true);
            if (alts.length===0) {
                throw this.noViableAlt(input, outerContext, D.configs, startIndex);
            } else if (alts.length===1) {
                return alts.minValue();
            } else {
                this.reportAmbiguity(dfa, D, startIndex, stopIndex, false, alts, D.configs);
                return alts.minValue();
            }
        }
        previousD = D;

        if (t !== Token.EOF) {
            input.consume();
            t = input.LA(1);
        }
    }
};
ParserATNSimulator.prototype.getExistingTargetState = function(previousD, t) {
    var edges = previousD.edges;
    if (edges===null) {
        return null;
    } else {
        return edges[t + 1] || null;
    }
};
ParserATNSimulator.prototype.computeTargetState = function(dfa, previousD, t) {
   var reach = this.computeReachSet(previousD.configs, t, false);
    if(reach===null) {
        this.addDFAEdge(dfa, previousD, t, ATNSimulator.ERROR);
        return ATNSimulator.ERROR;
    }
    var D = new DFAState(null, reach);

    var predictedAlt = this.getUniqueAlt(reach);

    if (this.debug) {
        var altSubSets = PredictionMode.getConflictingAltSubsets(reach);
        console.log("SLL altSubSets=" + Utils.arrayToString(altSubSets) +
                    ", previous=" + previousD.configs +
                    ", configs=" + reach +
                    ", predict=" + predictedAlt +
                    ", allSubsetsConflict=" +
                    PredictionMode.allSubsetsConflict(altSubSets) + ", conflictingAlts=" +
                    this.getConflictingAlts(reach));
    }
    if (predictedAlt!==ATN.INVALID_ALT_NUMBER) {
        D.isAcceptState = true;
        D.configs.uniqueAlt = predictedAlt;
        D.prediction = predictedAlt;
    } else if (PredictionMode.hasSLLConflictTerminatingPrediction(this.predictionMode, reach)) {
        D.configs.conflictingAlts = this.getConflictingAlts(reach);
        D.requiresFullContext = true;
        D.isAcceptState = true;
        D.prediction = D.configs.conflictingAlts.minValue();
    }
    if (D.isAcceptState && D.configs.hasSemanticContext) {
        this.predicateDFAState(D, this.atn.getDecisionState(dfa.decision));
        if( D.predicates!==null) {
            D.prediction = ATN.INVALID_ALT_NUMBER;
        }
    }
    D = this.addDFAEdge(dfa, previousD, t, D);
    return D;
};

ParserATNSimulator.prototype.predicateDFAState = function(dfaState, decisionState) {
    var nalts = decisionState.transitions.length;
    var altsToCollectPredsFrom = this.getConflictingAltsOrUniqueAlt(dfaState.configs);
    var altToPred = this.getPredsForAmbigAlts(altsToCollectPredsFrom, dfaState.configs, nalts);
    if (altToPred!==null) {
        dfaState.predicates = this.getPredicatePredictions(altsToCollectPredsFrom, altToPred);
        dfaState.prediction = ATN.INVALID_ALT_NUMBER; // make sure we use preds
    } else {
        dfaState.prediction = altsToCollectPredsFrom.minValue();
    }
};
ParserATNSimulator.prototype.execATNWithFullContext = function(dfa, D, // how far we got before failing over
                                     s0,
                                     input,
                                     startIndex,
                                     outerContext) {
    if (this.debug || this.debug_list_atn_decisions) {
        console.log("execATNWithFullContext "+s0);
    }
    var fullCtx = true;
    var foundExactAmbig = false;
    var reach = null;
    var previous = s0;
    input.seek(startIndex);
    var t = input.LA(1);
    var predictedAlt = -1;
    while (true) { // while more work
        reach = this.computeReachSet(previous, t, fullCtx);
        if (reach===null) {
            var e = this.noViableAlt(input, outerContext, previous, startIndex);
            input.seek(startIndex);
            var alt = this.getSynValidOrSemInvalidAltThatFinishedDecisionEntryRule(previous, outerContext);
            if(alt!==ATN.INVALID_ALT_NUMBER) {
                return alt;
            } else {
                throw e;
            }
        }
        var altSubSets = PredictionMode.getConflictingAltSubsets(reach);
        if(this.debug) {
            console.log("LL altSubSets=" + altSubSets + ", predict=" +
                  PredictionMode.getUniqueAlt(altSubSets) + ", resolvesToJustOneViableAlt=" +
                  PredictionMode.resolvesToJustOneViableAlt(altSubSets));
        }
        reach.uniqueAlt = this.getUniqueAlt(reach);
        if(reach.uniqueAlt!==ATN.INVALID_ALT_NUMBER) {
            predictedAlt = reach.uniqueAlt;
            break;
        } else if (this.predictionMode !== PredictionMode.LL_EXACT_AMBIG_DETECTION) {
            predictedAlt = PredictionMode.resolvesToJustOneViableAlt(altSubSets);
            if(predictedAlt !== ATN.INVALID_ALT_NUMBER) {
                break;
            }
        } else {
            if (PredictionMode.allSubsetsConflict(altSubSets) && PredictionMode.allSubsetsEqual(altSubSets)) {
                foundExactAmbig = true;
                predictedAlt = PredictionMode.getSingleViableAlt(altSubSets);
                break;
            }
        }
        previous = reach;
        if( t !== Token.EOF) {
            input.consume();
            t = input.LA(1);
        }
    }
    if (reach.uniqueAlt !== ATN.INVALID_ALT_NUMBER ) {
        this.reportContextSensitivity(dfa, predictedAlt, reach, startIndex, input.index);
        return predictedAlt;
    }

    this.reportAmbiguity(dfa, D, startIndex, input.index, foundExactAmbig, null, reach);

    return predictedAlt;
};

ParserATNSimulator.prototype.computeReachSet = function(closure, t, fullCtx) {
    if (this.debug) {
        console.log("in computeReachSet, starting closure: " + closure);
    }
    if( this.mergeCache===null) {
        this.mergeCache = new DoubleDict();
    }
    var intermediate = new ATNConfigSet(fullCtx);
    
    var skippedStopStates = null;
    for (var i=0; i<closure.items.length;i++) {
        var c = closure.items[i];
        if(this.debug) {
            console.log("testing " + this.getTokenName(t) + " at " + c);
        }
        if (c.state instanceof RuleStopState) {
            if (fullCtx || t === Token.EOF) {
                if (skippedStopStates===null) {
                    skippedStopStates = [];
                }
                skippedStopStates.push(c);
                if(this.debug) {
                    console.log("added " + c + " to skippedStopStates");
                }
            }
            continue;
        }
        for(var j=0;j<c.state.transitions.length;j++) {
            var trans = c.state.transitions[j];
            var target = this.getReachableTarget(trans, t);
            if (target!==null) {
                var cfg = new ATNConfig({state:target}, c);
                intermediate.add(cfg, this.mergeCache);
                if(this.debug) {
                    console.log("added " + cfg + " to intermediate");
                }
            }
        }
    }
    var reach = null;
    if (skippedStopStates===null && t!==Token.EOF) {
        if (intermediate.items.length===1) {
            reach = intermediate;
        } else if (this.getUniqueAlt(intermediate)!==ATN.INVALID_ALT_NUMBER) {
            reach = intermediate;
        }
    }
    if (reach===null) {
        reach = new ATNConfigSet(fullCtx);
        var closureBusy = new Set();
        var treatEofAsEpsilon = t === Token.EOF;
        for (var k=0; k<intermediate.items.length;k++) {
            this.closure(intermediate.items[k], reach, closureBusy, false, fullCtx, treatEofAsEpsilon);
        }
    }
    if (t === Token.EOF) {
        reach = this.removeAllConfigsNotInRuleStopState(reach, reach === intermediate);
    }
    if (skippedStopStates!==null && ( (! fullCtx) || (! PredictionMode.hasConfigInRuleStopState(reach)))) {
        for (var l=0; l<skippedStopStates.length;l++) {
            reach.add(skippedStopStates[l], this.mergeCache);
        }
    }
    if (reach.items.length===0) {
        return null;
    } else {
        return reach;
    }
};
ParserATNSimulator.prototype.removeAllConfigsNotInRuleStopState = function(configs, lookToEndOfRule) {
    if (PredictionMode.allConfigsInRuleStopStates(configs)) {
        return configs;
    }
    var result = new ATNConfigSet(configs.fullCtx);
    for(var i=0; i<configs.items.length;i++) {
        var config = configs.items[i];
        if (config.state instanceof RuleStopState) {
            result.add(config, this.mergeCache);
            continue;
        }
        if (lookToEndOfRule && config.state.epsilonOnlyTransitions) {
            var nextTokens = this.atn.nextTokens(config.state);
            if (nextTokens.contains(Token.EPSILON)) {
                var endOfRuleState = this.atn.ruleToStopState[config.state.ruleIndex];
                result.add(new ATNConfig({state:endOfRuleState}, config), this.mergeCache);
            }
        }
    }
    return result;
};

ParserATNSimulator.prototype.computeStartState = function(p, ctx, fullCtx) {
    var initialContext = predictionContextFromRuleContext(this.atn, ctx);
    var configs = new ATNConfigSet(fullCtx);
    for(var i=0;i<p.transitions.length;i++) {
        var target = p.transitions[i].target;
        var c = new ATNConfig({ state:target, alt:i+1, context:initialContext }, null);
        var closureBusy = new Set();
        this.closure(c, configs, closureBusy, true, fullCtx, false);
    }
    return configs;
};
ParserATNSimulator.prototype.applyPrecedenceFilter = function(configs) {
	var config;
	var statesFromAlt1 = [];
    var configSet = new ATNConfigSet(configs.fullCtx);
    for(var i=0; i<configs.items.length; i++) {
        config = configs.items[i];
        if (config.alt !== 1) {
            continue;
        }
        var updatedContext = config.semanticContext.evalPrecedence(this.parser, this._outerContext);
        if (updatedContext===null) {
            continue;
        }
        statesFromAlt1[config.state.stateNumber] = config.context;
        if (updatedContext !== config.semanticContext) {
            configSet.add(new ATNConfig({semanticContext:updatedContext}, config), this.mergeCache);
        } else {
            configSet.add(config, this.mergeCache);
        }
    }
    for(i=0; i<configs.items.length; i++) {
        config = configs.items[i];
        if (config.alt === 1) {
            continue;
        }
		if (!config.precedenceFilterSuppressed) {
            var context = statesFromAlt1[config.state.stateNumber] || null;
            if (context!==null && context.equals(config.context)) {
                continue;
            }
		}
        configSet.add(config, this.mergeCache);
    }
    return configSet;
};

ParserATNSimulator.prototype.getReachableTarget = function(trans, ttype) {
    if (trans.matches(ttype, 0, this.atn.maxTokenType)) {
        return trans.target;
    } else {
        return null;
    }
};

ParserATNSimulator.prototype.getPredsForAmbigAlts = function(ambigAlts, configs, nalts) {
    var altToPred = [];
    for(var i=0;i<configs.items.length;i++) {
        var c = configs.items[i];
        if(ambigAlts.contains( c.alt )) {
            altToPred[c.alt] = SemanticContext.orContext(altToPred[c.alt] || null, c.semanticContext);
        }
    }
    var nPredAlts = 0;
    for (i =1;i< nalts+1;i++) {
        var pred = altToPred[i] || null;
        if (pred===null) {
            altToPred[i] = SemanticContext.NONE;
        } else if (pred !== SemanticContext.NONE) {
            nPredAlts += 1;
        }
    }
    if (nPredAlts===0) {
        altToPred = null;
    }
    if (this.debug) {
        console.log("getPredsForAmbigAlts result " + Utils.arrayToString(altToPred));
    }
    return altToPred;
};

ParserATNSimulator.prototype.getPredicatePredictions = function(ambigAlts, altToPred) {
    var pairs = [];
    var containsPredicate = false;
    for (var i=1; i<altToPred.length;i++) {
        var pred = altToPred[i];
        if( ambigAlts!==null && ambigAlts.contains( i )) {
            pairs.push(new PredPrediction(pred, i));
        }
        if (pred !== SemanticContext.NONE) {
            containsPredicate = true;
        }
    }
    if (! containsPredicate) {
        return null;
    }
    return pairs;
};
ParserATNSimulator.prototype.getSynValidOrSemInvalidAltThatFinishedDecisionEntryRule = function(configs, outerContext) {
    var cfgs = this.splitAccordingToSemanticValidity(configs, outerContext);
    var semValidConfigs = cfgs[0];
    var semInvalidConfigs = cfgs[1];
    var alt = this.getAltThatFinishedDecisionEntryRule(semValidConfigs);
    if (alt!==ATN.INVALID_ALT_NUMBER) { // semantically/syntactically viable path exists
        return alt;
    }
    if (semInvalidConfigs.items.length>0) {
        alt = this.getAltThatFinishedDecisionEntryRule(semInvalidConfigs);
        if (alt!==ATN.INVALID_ALT_NUMBER) { // syntactically viable path exists
            return alt;
        }
    }
    return ATN.INVALID_ALT_NUMBER;
};
    
ParserATNSimulator.prototype.getAltThatFinishedDecisionEntryRule = function(configs) {
    var alts = [];
    for(var i=0;i<configs.items.length; i++) {
        var c = configs.items[i];
        if (c.reachesIntoOuterContext>0 || ((c.state instanceof RuleStopState) && c.context.hasEmptyPath())) {
            if(alts.indexOf(c.alt)<0) {
                alts.push(c.alt);
            }
        }
    }
    if (alts.length===0) {
        return ATN.INVALID_ALT_NUMBER;
    } else {
        return Math.min.apply(null, alts);
    }
};
ParserATNSimulator.prototype.splitAccordingToSemanticValidity = function( configs, outerContext) {
    var succeeded = new ATNConfigSet(configs.fullCtx);
    var failed = new ATNConfigSet(configs.fullCtx);
    for(var i=0;i<configs.items.length; i++) {
        var c = configs.items[i];
        if (c.semanticContext !== SemanticContext.NONE) {
            var predicateEvaluationResult = c.semanticContext.evaluate(this.parser, outerContext);
            if (predicateEvaluationResult) {
                succeeded.add(c);
            } else {
                failed.add(c);
            }
        } else {
            succeeded.add(c);
        }
    }
    return [succeeded, failed];
};
ParserATNSimulator.prototype.evalSemanticContext = function(predPredictions, outerContext, complete) {
    var predictions = new BitSet();
    for(var i=0;i<predPredictions.length;i++) {
    	var pair = predPredictions[i];
        if (pair.pred === SemanticContext.NONE) {
            predictions.add(pair.alt);
            if (! complete) {
                break;
            }
            continue;
        }
        var predicateEvaluationResult = pair.pred.evaluate(this.parser, outerContext);
        if (this.debug || this.dfa_debug) {
            console.log("eval pred " + pair + "=" + predicateEvaluationResult);
        }
        if (predicateEvaluationResult) {
            if (this.debug || this.dfa_debug) {
                console.log("PREDICT " + pair.alt);
            }
            predictions.add(pair.alt);
            if (! complete) {
                break;
            }
        }
    }
    return predictions;
};

ParserATNSimulator.prototype.closure = function(config, configs, closureBusy, collectPredicates, fullCtx, treatEofAsEpsilon) {
    var initialDepth = 0;
    this.closureCheckingStopState(config, configs, closureBusy, collectPredicates,
                             fullCtx, initialDepth, treatEofAsEpsilon);
};


ParserATNSimulator.prototype.closureCheckingStopState = function(config, configs, closureBusy, collectPredicates, fullCtx, depth, treatEofAsEpsilon) {
    if (this.debug) {
        console.log("closure(" + config.toString(this.parser,true) + ")");
        console.log("configs(" + configs.toString() + ")");
        if(config.reachesIntoOuterContext>50) {
            throw "problem";
        }
    }
    if (config.state instanceof RuleStopState) {
        if (! config.context.isEmpty()) {
            for ( var i =0; i<config.context.length; i++) {
                if (config.context.getReturnState(i) === PredictionContext.EMPTY_RETURN_STATE) {
                    if (fullCtx) {
                        configs.add(new ATNConfig({state:config.state, context:PredictionContext.EMPTY}, config), this.mergeCache);
                        continue;
                    } else {
                        if (this.debug) {
                            console.log("FALLING off rule " + this.getRuleName(config.state.ruleIndex));
                        }
                        this.closure_(config, configs, closureBusy, collectPredicates,
                                 fullCtx, depth, treatEofAsEpsilon);
                    }
                    continue;
                }
                returnState = this.atn.states[config.context.getReturnState(i)];
                newContext = config.context.getParent(i); // "pop" return state
                var parms = {state:returnState, alt:config.alt, context:newContext, semanticContext:config.semanticContext};
                c = new ATNConfig(parms, null);
                c.reachesIntoOuterContext = config.reachesIntoOuterContext;
                this.closureCheckingStopState(c, configs, closureBusy, collectPredicates, fullCtx, depth - 1, treatEofAsEpsilon);
            }
            return;
        } else if( fullCtx) {
            configs.add(config, this.mergeCache);
            return;
        } else {
            if (this.debug) {
                console.log("FALLING off rule " + this.getRuleName(config.state.ruleIndex));
            }
        }
    }
    this.closure_(config, configs, closureBusy, collectPredicates, fullCtx, depth, treatEofAsEpsilon);
};
ParserATNSimulator.prototype.closure_ = function(config, configs, closureBusy, collectPredicates, fullCtx, depth, treatEofAsEpsilon) {
    var p = config.state;
    if (! p.epsilonOnlyTransitions) {
        configs.add(config, this.mergeCache);
    }
    for(var i = 0;i<p.transitions.length; i++) {
        var t = p.transitions[i];
        var continueCollecting = collectPredicates && !(t instanceof ActionTransition);
        var c = this.getEpsilonTarget(config, t, continueCollecting, depth === 0, fullCtx, treatEofAsEpsilon);
        if (c!==null) {
			if (!t.isEpsilon && closureBusy.add(c)!==c){
				continue;
			}
            var newDepth = depth;
            if ( config.state instanceof RuleStopState) {

                if (closureBusy.add(c)!==c) {
                    continue;
                }

				if (this._dfa !== null && this._dfa.precedenceDfa) {
					if (t.outermostPrecedenceReturn === this._dfa.atnStartState.ruleIndex) {
						c.precedenceFilterSuppressed = true;
					}
				}

                c.reachesIntoOuterContext += 1;
                configs.dipsIntoOuterContext = true; // TODO: can remove? only care when we add to set per middle of this method
                newDepth -= 1;
                if (this.debug) {
                    console.log("dips into outer ctx: " + c);
                }
            } else if (t instanceof RuleTransition) {
                if (newDepth >= 0) {
                    newDepth += 1;
                }
            }
            this.closureCheckingStopState(c, configs, closureBusy, continueCollecting, fullCtx, newDepth, treatEofAsEpsilon);
        }
    }
};

ParserATNSimulator.prototype.getRuleName = function( index) {
    if (this.parser!==null && index>=0) {
        return this.parser.ruleNames[index];
    } else {
        return "<rule " + index + ">";
    }
};

ParserATNSimulator.prototype.getEpsilonTarget = function(config, t, collectPredicates, inContext, fullCtx, treatEofAsEpsilon) {
    switch(t.serializationType) {
    case Transition.RULE:
        return this.ruleTransition(config, t);
    case Transition.PRECEDENCE:
        return this.precedenceTransition(config, t, collectPredicates, inContext, fullCtx);
    case Transition.PREDICATE:
        return this.predTransition(config, t, collectPredicates, inContext, fullCtx);
    case Transition.ACTION:
        return this.actionTransition(config, t);
    case Transition.EPSILON:
        return new ATNConfig({state:t.target}, config);
    case Transition.ATOM:
    case Transition.RANGE:
    case Transition.SET:
        if (treatEofAsEpsilon) {
            if (t.matches(Token.EOF, 0, 1)) {
                return new ATNConfig({state: t.target}, config);
            }
        }
        return null;
    default:
    	return null;
    }
};

ParserATNSimulator.prototype.actionTransition = function(config, t) {
    if (this.debug) {
        console.log("ACTION edge " + t.ruleIndex + ":" + t.actionIndex);
    }
    return new ATNConfig({state:t.target}, config);
};

ParserATNSimulator.prototype.precedenceTransition = function(config, pt,  collectPredicates, inContext, fullCtx) {
    if (this.debug) {
        console.log("PRED (collectPredicates=" + collectPredicates + ") " +
                pt.precedence + ">=_p, ctx dependent=true");
        if (this.parser!==null) {
        	console.log("context surrounding pred is " + Utils.arrayToString(this.parser.getRuleInvocationStack()));
        }
    }
    var c = null;
    if (collectPredicates && inContext) {
        if (fullCtx) {
            var currentPosition = this._input.index;
            this._input.seek(this._startIndex);
            var predSucceeds = pt.getPredicate().evaluate(this.parser, this._outerContext);
            this._input.seek(currentPosition);
            if (predSucceeds) {
                c = new ATNConfig({state:pt.target}, config); // no pred context
            }
        } else {
            newSemCtx = SemanticContext.andContext(config.semanticContext, pt.getPredicate());
            c = new ATNConfig({state:pt.target, semanticContext:newSemCtx}, config);
        }
    } else {
        c = new ATNConfig({state:pt.target}, config);
    }
    if (this.debug) {
        console.log("config from pred transition=" + c);
    }
    return c;
};

ParserATNSimulator.prototype.predTransition = function(config, pt, collectPredicates, inContext, fullCtx) {
    if (this.debug) {
        console.log("PRED (collectPredicates=" + collectPredicates + ") " + pt.ruleIndex +
                ":" + pt.predIndex + ", ctx dependent=" + pt.isCtxDependent);
        if (this.parser!==null) {
            console.log("context surrounding pred is " + Utils.arrayToString(this.parser.getRuleInvocationStack()));
        }
    }
    var c = null;
    if (collectPredicates && ((pt.isCtxDependent && inContext) || ! pt.isCtxDependent)) {
        if (fullCtx) {
            var currentPosition = this._input.index;
            this._input.seek(this._startIndex);
            var predSucceeds = pt.getPredicate().evaluate(this.parser, this._outerContext);
            this._input.seek(currentPosition);
            if (predSucceeds) {
                c = new ATNConfig({state:pt.target}, config); // no pred context
            }
        } else {
            var newSemCtx = SemanticContext.andContext(config.semanticContext, pt.getPredicate());
            c = new ATNConfig({state:pt.target, semanticContext:newSemCtx}, config);
        }
    } else {
        c = new ATNConfig({state:pt.target}, config);
    }
    if (this.debug) {
        console.log("config from pred transition=" + c);
    }
    return c;
};

ParserATNSimulator.prototype.ruleTransition = function(config, t) {
    if (this.debug) {
        console.log("CALL rule " + this.getRuleName(t.target.ruleIndex) + ", ctx=" + config.context);
    }
    var returnState = t.followState;
    var newContext = SingletonPredictionContext.create(config.context, returnState.stateNumber);
    return new ATNConfig({state:t.target, context:newContext}, config );
};

ParserATNSimulator.prototype.getConflictingAlts = function(configs) {
    var altsets = PredictionMode.getConflictingAltSubsets(configs);
    return PredictionMode.getAlts(altsets);
};

ParserATNSimulator.prototype.getConflictingAltsOrUniqueAlt = function(configs) {
    var conflictingAlts = null;
    if (configs.uniqueAlt!== ATN.INVALID_ALT_NUMBER) {
        conflictingAlts = new BitSet();
        conflictingAlts.add(configs.uniqueAlt);
    } else {
        conflictingAlts = configs.conflictingAlts;
    }
    return conflictingAlts;
};

ParserATNSimulator.prototype.getTokenName = function( t) {
    if (t===Token.EOF) {
        return "EOF";
    }
    if( this.parser!==null && this.parser.literalNames!==null) {
        if (t >= this.parser.literalNames.length) {
            console.log("" + t + " ttype out of range: " + this.parser.literalNames);
            console.log("" + this.parser.getInputStream().getTokens());
        } else {
            return this.parser.literalNames[t] + "<" + t + ">";
        }
    }
    return "" + t;
};

ParserATNSimulator.prototype.getLookaheadName = function(input) {
    return this.getTokenName(input.LA(1));
};
ParserATNSimulator.prototype.dumpDeadEndConfigs = function(nvae) {
    console.log("dead end configs: ");
    var decs = nvae.getDeadEndConfigs();
    for(var i=0; i<decs.length; i++) {
    	var c = decs[i];
        var trans = "no edges";
        if (c.state.transitions.length>0) {
            var t = c.state.transitions[0];
            if (t instanceof AtomTransition) {
                trans = "Atom "+ this.getTokenName(t.label);
            } else if (t instanceof SetTransition) {
                var neg = (t instanceof NotSetTransition);
                trans = (neg ? "~" : "") + "Set " + t.set;
            }
        }
        console.error(c.toString(this.parser, true) + ":" + trans);
    }
};

ParserATNSimulator.prototype.noViableAlt = function(input, outerContext, configs, startIndex) {
    return new NoViableAltException(this.parser, input, input.get(startIndex), input.LT(1), configs, outerContext);
};

ParserATNSimulator.prototype.getUniqueAlt = function(configs) {
    var alt = ATN.INVALID_ALT_NUMBER;
    for(var i=0;i<configs.items.length;i++) {
    	var c = configs.items[i];
        if (alt === ATN.INVALID_ALT_NUMBER) {
            alt = c.alt // found first alt
        } else if( c.alt!==alt) {
            return ATN.INVALID_ALT_NUMBER;
        }
    }
    return alt;
};
ParserATNSimulator.prototype.addDFAEdge = function(dfa, from_, t, to) {
    if( this.debug) {
        console.log("EDGE " + from_ + " -> " + to + " upon " + this.getTokenName(t));
    }
    if (to===null) {
        return null;
    }
    to = this.addDFAState(dfa, to); // used existing if possible not incoming
    if (from_===null || t < -1 || t > this.atn.maxTokenType) {
        return to;
    }
    if (from_.edges===null) {
        from_.edges = [];
    }
    from_.edges[t+1] = to; // connect

    if (this.debug) {
        var names = this.parser===null ? null : this.parser.literalNames;
        console.log("DFA=\n" + dfa.toString(names));
    }
    return to;
};
ParserATNSimulator.prototype.addDFAState = function(dfa, D) {
    if (D == ATNSimulator.ERROR) {
        return D;
    }
    var hash = D.hashString();
    var existing = dfa.states[hash] || null;
    if(existing!==null) {
        return existing;
    }
    D.stateNumber = dfa.states.length;
    if (! D.configs.readonly) {
        D.configs.optimizeConfigs(this);
        D.configs.setReadonly(true);
    }
    dfa.states[hash] = D;
    if (this.debug) {
        console.log("adding new DFA state: " + D);
    }
    return D;
};

ParserATNSimulator.prototype.reportAttemptingFullContext = function(dfa, conflictingAlts, configs, startIndex, stopIndex) {
    if (this.debug || this.retry_debug) {
        var interval = new Interval(startIndex, stopIndex + 1);
        console.log("reportAttemptingFullContext decision=" + dfa.decision + ":" + configs +
                           ", input=" + this.parser.getTokenStream().getText(interval));
    }
    if (this.parser!==null) {
        this.parser.getErrorListenerDispatch().reportAttemptingFullContext(this.parser, dfa, startIndex, stopIndex, conflictingAlts, configs);
    }
};

ParserATNSimulator.prototype.reportContextSensitivity = function(dfa, prediction, configs, startIndex, stopIndex) {
    if (this.debug || this.retry_debug) {
        var interval = new Interval(startIndex, stopIndex + 1);
        console.log("reportContextSensitivity decision=" + dfa.decision + ":" + configs +
                           ", input=" + this.parser.getTokenStream().getText(interval));
    }
    if (this.parser!==null) {
        this.parser.getErrorListenerDispatch().reportContextSensitivity(this.parser, dfa, startIndex, stopIndex, prediction, configs);
    }
};
ParserATNSimulator.prototype.reportAmbiguity = function(dfa, D, startIndex, stopIndex,
                               exact, ambigAlts, configs ) {
    if (this.debug || this.retry_debug) {
        var interval = new Interval(startIndex, stopIndex + 1);
        console.log("reportAmbiguity " + ambigAlts + ":" + configs +
                           ", input=" + this.parser.getTokenStream().getText(interval));
    }
    if (this.parser!==null) {
        this.parser.getErrorListenerDispatch().reportAmbiguity(this.parser, dfa, startIndex, stopIndex, exact, ambigAlts, configs);
    }
};
            
exports.ParserATNSimulator = ParserATNSimulator;

});

define("ace/mode/cql/antlr4/atn/index",["require","exports","module","ace/mode/cql/antlr4/atn/ATN","ace/mode/cql/antlr4/atn/ATNDeserializer","ace/mode/cql/antlr4/atn/LexerATNSimulator","ace/mode/cql/antlr4/atn/ParserATNSimulator","ace/mode/cql/antlr4/atn/PredictionMode"], function(require, exports, module) {
  exports.ATN = require('./ATN').ATN;
  exports.ATNDeserializer = require('./ATNDeserializer').ATNDeserializer;
  exports.LexerATNSimulator = require('./LexerATNSimulator').LexerATNSimulator;
  exports.ParserATNSimulator = require('./ParserATNSimulator').ParserATNSimulator;
  exports.PredictionMode = require('./PredictionMode').PredictionMode;
  });

define("ace/mode/cql/antlr4/dfa/DFASerializer",["require","exports","module"], function(require, exports, module) {


function DFASerializer(dfa, literalNames, symbolicNames) {
	this.dfa = dfa;
	this.literalNames = literalNames || [];
	this.symbolicNames = symbolicNames || [];
	return this;
}

DFASerializer.prototype.toString = function() {
   if(this.dfa.s0 === null) {
       return null;
   }
   var buf = "";
   var states = this.dfa.sortedStates();
   for(var i=0;i<states.length;i++) {
       var s = states[i];
       if(s.edges!==null) {
            var n = s.edges.length;
            for(var j=0;j<n;j++) {
                var t = s.edges[j] || null;
                if(t!==null && t.stateNumber !== 0x7FFFFFFF) {
                    buf = buf.concat(this.getStateString(s));
                    buf = buf.concat("-");
                    buf = buf.concat(this.getEdgeLabel(j));
                    buf = buf.concat("->");
                    buf = buf.concat(this.getStateString(t));
                    buf = buf.concat('\n');
                }
            }
       }
   }
   return buf.length===0 ? null : buf;
};

DFASerializer.prototype.getEdgeLabel = function(i) {
    if (i===0) {
        return "EOF";
    } else if(this.literalNames !==null || this.symbolicNames!==null) {
        return this.literalNames[i-1] || this.symbolicNames[i-1];
    } else {
        return String.fromCharCode(i-1);
    }
};

DFASerializer.prototype.getStateString = function(s) {
    var baseStateStr = ( s.isAcceptState ? ":" : "") + "s" + s.stateNumber + ( s.requiresFullContext ? "^" : "");
    if(s.isAcceptState) {
        if (s.predicates !== null) {
            return baseStateStr + "=>" + s.predicates.toString();
        } else {
            return baseStateStr + "=>" + s.prediction.toString();
        }
    } else {
        return baseStateStr;
    }
};

function LexerDFASerializer(dfa) {
	DFASerializer.call(this, dfa, null);
	return this;
}

LexerDFASerializer.prototype = Object.create(DFASerializer.prototype);
LexerDFASerializer.prototype.constructor = LexerDFASerializer;

LexerDFASerializer.prototype.getEdgeLabel = function(i) {
	return "'" + String.fromCharCode(i) + "'";
};

exports.DFASerializer = DFASerializer;
exports.LexerDFASerializer = LexerDFASerializer;

});

define("ace/mode/cql/antlr4/dfa/DFA",["require","exports","module","ace/mode/cql/antlr4/dfa/DFAState","ace/mode/cql/antlr4/atn/ATNConfigSet","ace/mode/cql/antlr4/dfa/DFASerializer","ace/mode/cql/antlr4/dfa/DFASerializer"], function(require, exports, module) {

var DFAState = require('./DFAState').DFAState;
var ATNConfigSet = require('./../atn/ATNConfigSet').ATNConfigSet;
var DFASerializer = require('./DFASerializer').DFASerializer;
var LexerDFASerializer = require('./DFASerializer').LexerDFASerializer;

function DFAStatesSet() {
	return this;
}

Object.defineProperty(DFAStatesSet.prototype, "length", {
	get : function() {
		return Object.keys(this).length;
	}
});

function DFA(atnStartState, decision) {
	if (decision === undefined) {
		decision = 0;
	}
	this.atnStartState = atnStartState;
	this.decision = decision;
	this._states = new DFAStatesSet();
	this.s0 = null;
	this.precedenceDfa = false;
	return this;
}

DFA.prototype.getPrecedenceStartState = function(precedence) {
	if (!(this.precedenceDfa)) {
		throw ("Only precedence DFAs may contain a precedence start state.");
	}
	if (precedence < 0 || precedence >= this.s0.edges.length) {
		return null;
	}
	return this.s0.edges[precedence] || null;
};
DFA.prototype.setPrecedenceStartState = function(precedence, startState) {
	if (!(this.precedenceDfa)) {
		throw ("Only precedence DFAs may contain a precedence start state.");
	}
	if (precedence < 0) {
		return;
	}
	this.s0.edges[precedence] = startState;
};

DFA.prototype.setPrecedenceDfa = function(precedenceDfa) {
	if (this.precedenceDfa!==precedenceDfa) {
		this._states = new DFAStatesSet();
		if (precedenceDfa) {
			var precedenceState = new DFAState(new ATNConfigSet());
			precedenceState.edges = [];
			precedenceState.isAcceptState = false;
			precedenceState.requiresFullContext = false;
			this.s0 = precedenceState;
		} else {
			this.s0 = null;
		}
		this.precedenceDfa = precedenceDfa;
	}
};

Object.defineProperty(DFA.prototype, "states", {
	get : function() {
		return this._states;
	}
});
DFA.prototype.sortedStates = function() {
	var keys = Object.keys(this._states);
	var list = [];
	for(var i=0;i<keys.length;i++) {
		list.push(this._states[keys[i]]);
	}
	return list.sort(function(a, b) {
		return a.stateNumber - b.stateNumber;
	});
};

DFA.prototype.toString = function(literalNames, symbolicNames) {
	literalNames = literalNames || null;
	symbolicNames = symbolicNames || null;
	if (this.s0 === null) {
		return "";
	}
	var serializer = new DFASerializer(this, literalNames, symbolicNames);
	return serializer.toString();
};

DFA.prototype.toLexerString = function() {
	if (this.s0 === null) {
		return "";
	}
	var serializer = new LexerDFASerializer(this);
	return serializer.toString();
};

exports.DFA = DFA;
});

define("ace/mode/cql/antlr4/dfa/index",["require","exports","module","ace/mode/cql/antlr4/dfa/DFA","ace/mode/cql/antlr4/dfa/DFASerializer","ace/mode/cql/antlr4/dfa/DFASerializer","ace/mode/cql/antlr4/dfa/DFAState"], function(require, exports, module) {
  exports.DFA = require('./DFA').DFA;
  exports.DFASerializer = require('./DFASerializer').DFASerializer;
  exports.LexerDFASerializer = require('./DFASerializer').LexerDFASerializer;
  exports.PredPrediction = require('./DFAState').PredPrediction;
});

define("ace/mode/cql/antlr4/InputStream",["require","exports","module","ace/mode/cql/antlr4/Token"], function(require, exports, module) {

var Token = require('./Token').Token;

function _loadString(stream) {
	stream._index = 0;
	stream.data = [];
	for (var i = 0; i < stream.strdata.length; i++) {
		stream.data.push(stream.strdata.charCodeAt(i));
	}
	stream._size = stream.data.length;
}

function InputStream(data) {
	this.name = "<empty>";
	this.strdata = data;
	_loadString(this);
	return this;
}

Object.defineProperty(InputStream.prototype, "index", {
	get : function() {
		return this._index;
	}
});

Object.defineProperty(InputStream.prototype, "size", {
	get : function() {
		return this._size;
	}
});
InputStream.prototype.reset = function() {
	this._index = 0;
};

InputStream.prototype.consume = function() {
	if (this._index >= this._size) {
		throw ("cannot consume EOF");
	}
	this._index += 1;
};

InputStream.prototype.LA = function(offset) {
	if (offset === 0) {
		return 0; // undefined
	}
	if (offset < 0) {
		offset += 1; // e.g., translate LA(-1) to use offset=0
	}
	var pos = this._index + offset - 1;
	if (pos < 0 || pos >= this._size) { // invalid
		return Token.EOF;
	}
	return this.data[pos];
};

InputStream.prototype.LT = function(offset) {
	return this.LA(offset);
};
InputStream.prototype.mark = function() {
	return -1;
};

InputStream.prototype.release = function(marker) {
};
InputStream.prototype.seek = function(_index) {
	if (_index <= this._index) {
		this._index = _index; // just jump; don't update stream state (line,
		return;
	}
	this._index = Math.min(_index, this._size);
};

InputStream.prototype.getText = function(start, stop) {
	if (stop >= this._size) {
		stop = this._size - 1;
	}
	if (start >= this._size) {
		return "";
	} else {
		return this.strdata.slice(start, stop + 1);
	}
};

InputStream.prototype.toString = function() {
	return this.strdata;
};

exports.InputStream = InputStream;
});

define("ace/mode/cql/antlr4/BufferedTokenStream",["require","exports","module","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/Lexer","ace/mode/cql/antlr4/IntervalSet"], function(require, exports, module) {

var Token = require('./Token').Token;
var Lexer = require('./Lexer').Lexer;
var Interval = require('./IntervalSet').Interval;
function TokenStream() {
	return this;
}

function BufferedTokenStream(tokenSource) {

	TokenStream.call(this);
	this.tokenSource = tokenSource;
	this.tokens = [];
	this.index = -1;
	this.fetchedEOF = false;
	return this;
}

BufferedTokenStream.prototype = Object.create(TokenStream.prototype);
BufferedTokenStream.prototype.constructor = BufferedTokenStream;

BufferedTokenStream.prototype.mark = function() {
	return 0;
};

BufferedTokenStream.prototype.release = function(marker) {
};

BufferedTokenStream.prototype.reset = function() {
	this.seek(0);
};

BufferedTokenStream.prototype.seek = function(index) {
	this.lazyInit();
	this.index = this.adjustSeekIndex(index);
};

BufferedTokenStream.prototype.get = function(index) {
	this.lazyInit();
	return this.tokens[index];
};

BufferedTokenStream.prototype.consume = function() {
	var skipEofCheck = false;
	if (this.index >= 0) {
		if (this.fetchedEOF) {
			skipEofCheck = this.index < this.tokens.length - 1;
		} else {
			skipEofCheck = this.index < this.tokens.length;
		}
	} else {
		skipEofCheck = false;
	}
	if (!skipEofCheck && this.LA(1) === Token.EOF) {
		throw "cannot consume EOF";
	}
	if (this.sync(this.index + 1)) {
		this.index = this.adjustSeekIndex(this.index + 1);
	}
};
BufferedTokenStream.prototype.sync = function(i) {
	var n = i - this.tokens.length + 1; // how many more elements we need?
	if (n > 0) {
		var fetched = this.fetch(n);
		return fetched >= n;
	}
	return true;
};
BufferedTokenStream.prototype.fetch = function(n) {
	if (this.fetchedEOF) {
		return 0;
	}
	for (var i = 0; i < n; i++) {
		var t = this.tokenSource.nextToken();
		t.tokenIndex = this.tokens.length;
		this.tokens.push(t);
		if (t.type === Token.EOF) {
			this.fetchedEOF = true;
			return i + 1;
		}
	}
	return n;
};
BufferedTokenStream.prototype.getTokens = function(start, stop, types) {
	if (types === undefined) {
		types = null;
	}
	if (start < 0 || stop < 0) {
		return null;
	}
	this.lazyInit();
	var subset = [];
	if (stop >= this.tokens.length) {
		stop = this.tokens.length - 1;
	}
	for (var i = start; i < stop; i++) {
		var t = this.tokens[i];
		if (t.type === Token.EOF) {
			break;
		}
		if (types === null || types.contains(t.type)) {
			subset.push(t);
		}
	}
	return subset;
};

BufferedTokenStream.prototype.LA = function(i) {
	return this.LT(i).type;
};

BufferedTokenStream.prototype.LB = function(k) {
	if (this.index - k < 0) {
		return null;
	}
	return this.tokens[this.index - k];
};

BufferedTokenStream.prototype.LT = function(k) {
	this.lazyInit();
	if (k === 0) {
		return null;
	}
	if (k < 0) {
		return this.LB(-k);
	}
	var i = this.index + k - 1;
	this.sync(i);
	if (i >= this.tokens.length) { // return EOF token
		return this.tokens[this.tokens.length - 1];
	}
	return this.tokens[i];
};

BufferedTokenStream.prototype.adjustSeekIndex = function(i) {
	return i;
};

BufferedTokenStream.prototype.lazyInit = function() {
	if (this.index === -1) {
		this.setup();
	}
};

BufferedTokenStream.prototype.setup = function() {
	this.sync(0);
	this.index = this.adjustSeekIndex(0);
};
BufferedTokenStream.prototype.setTokenSource = function(tokenSource) {
	this.tokenSource = tokenSource;
	this.tokens = [];
	this.index = -1;
};
BufferedTokenStream.prototype.nextTokenOnChannel = function(i, channel) {
	this.sync(i);
	if (i >= this.tokens.length) {
		return -1;
	}
	var token = this.tokens[i];
	while (token.channel !== this.channel) {
		if (token.type === Token.EOF) {
			return -1;
		}
		i += 1;
		this.sync(i);
		token = this.tokens[i];
	}
	return i;
};
BufferedTokenStream.prototype.previousTokenOnChannel = function(i, channel) {
	while (i >= 0 && this.tokens[i].channel !== channel) {
		i -= 1;
	}
	return i;
};
BufferedTokenStream.prototype.getHiddenTokensToRight = function(tokenIndex,
		channel) {
	if (channel === undefined) {
		channel = -1;
	}
	this.lazyInit();
	if (this.tokenIndex < 0 || tokenIndex >= this.tokens.length) {
		throw "" + tokenIndex + " not in 0.." + this.tokens.length - 1;
	}
	var nextOnChannel = this.nextTokenOnChannel(tokenIndex + 1,
			Lexer.DEFAULT_TOKEN_CHANNEL);
	var from_ = tokenIndex + 1;
	var to = nextOnChannel === -1 ? this.tokens.length - 1 : nextOnChannel;
	return this.filterForChannel(from_, to, channel);
};
BufferedTokenStream.prototype.getHiddenTokensToLeft = function(tokenIndex,
		channel) {
	if (channel === undefined) {
		channel = -1;
	}
	this.lazyInit();
	if (tokenIndex < 0 || tokenIndex >= this.tokens.length) {
		throw "" + tokenIndex + " not in 0.." + this.tokens.length - 1;
	}
	var prevOnChannel = this.previousTokenOnChannel(tokenIndex - 1,
			Lexer.DEFAULT_TOKEN_CHANNEL);
	if (prevOnChannel === tokenIndex - 1) {
		return null;
	}
	var from_ = prevOnChannel + 1;
	var to = tokenIndex - 1;
	return this.filterForChannel(from_, to, channel);
};

BufferedTokenStream.prototype.filterForChannel = function(left, right, channel) {
	var hidden = [];
	for (var i = left; i < right + 1; i++) {
		var t = this.tokens[i];
		if (channel === -1) {
			if (t.channel !== Lexer.DEFAULT_TOKEN_CHANNEL) {
				hidden.push(t);
			}
		} else if (t.channel === channel) {
			hidden.push(t);
		}
	}
	if (hidden.length === 0) {
		return null;
	}
	return hidden;
};

BufferedTokenStream.prototype.getSourceName = function() {
	return this.tokenSource.getSourceName();
};
BufferedTokenStream.prototype.getText = function(interval) {
	this.lazyInit();
	this.fill();
	if (interval === undefined || interval === null) {
		interval = new Interval(0, this.tokens.length - 1);
	}
	var start = interval.start;
	if (start instanceof Token) {
		start = start.tokenIndex;
	}
	var stop = interval.stop;
	if (stop instanceof Token) {
		stop = stop.tokenIndex;
	}
	if (start === null || stop === null || start < 0 || stop < 0) {
		return "";
	}
	if (stop >= this.tokens.length) {
		stop = this.tokens.length - 1;
	}
	var s = "";
	for (var i = start; i < stop + 1; i++) {
		var t = this.tokens[i];
		if (t.type === Token.EOF) {
			break;
		}
		s = s + t.text;
	}
	return s;
};
BufferedTokenStream.prototype.fill = function() {
	this.lazyInit();
	while (this.fetch(1000) === 1000) {
		continue;
	}
};

exports.BufferedTokenStream = BufferedTokenStream;
});

define("ace/mode/cql/antlr4/CommonTokenStream",["require","exports","module","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/BufferedTokenStream"], function(require, exports, module) {

var Token = require('./Token').Token;
var BufferedTokenStream = require('./BufferedTokenStream').BufferedTokenStream;

function CommonTokenStream(lexer, channel) {
	BufferedTokenStream.call(this, lexer);
    this.channel = channel===undefined ? Token.DEFAULT_CHANNEL : channel;
    return this;
}

CommonTokenStream.prototype = Object.create(BufferedTokenStream.prototype);
CommonTokenStream.prototype.constructor = CommonTokenStream;

CommonTokenStream.prototype.adjustSeekIndex = function(i) {
    return this.nextTokenOnChannel(i, this.channel);
};

CommonTokenStream.prototype.LB = function(k) {
    if (k===0 || this.index-k<0) {
        return null;
    }
    var i = this.index;
    var n = 1;
    while (n <= k) {
        i = this.previousTokenOnChannel(i - 1, this.channel);
        n += 1;
    }
    if (i < 0) {
        return null;
    }
    return this.tokens[i];
};

CommonTokenStream.prototype.LT = function(k) {
    this.lazyInit();
    if (k === 0) {
        return null;
    }
    if (k < 0) {
        return this.LB(-k);
    }
    var i = this.index;
    var n = 1; // we know tokens[pos] is a good one
    while (n < k) {
        if (this.sync(i + 1)) {
            i = this.nextTokenOnChannel(i + 1, this.channel);
        }
        n += 1;
    }
    return this.tokens[i];
};
CommonTokenStream.prototype.getNumberOfOnChannelTokens = function() {
    var n = 0;
    this.fill();
    for (var i =0; i< this.tokens.length;i++) {
        var t = this.tokens[i];
        if( t.channel===this.channel) {
            n += 1;
        }
        if( t.type===Token.EOF) {
            break;
        }
    }
    return n;
};

exports.CommonTokenStream = CommonTokenStream;
});

define("ace/mode/cql/antlr4/Parser",["require","exports","module","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/tree/Tree","ace/mode/cql/antlr4/Recognizer","ace/mode/cql/antlr4/error/ErrorStrategy","ace/mode/cql/antlr4/atn/ATNDeserializer","ace/mode/cql/antlr4/atn/ATNDeserializationOptions","ace/mode/cql/antlr4/Lexer"], function(require, exports, module) {

var Token = require('./Token').Token;
var ParseTreeListener = require('./tree/Tree').ParseTreeListener;
var Recognizer = require('./Recognizer').Recognizer;
var DefaultErrorStrategy = require('./error/ErrorStrategy').DefaultErrorStrategy;
var ATNDeserializer = require('./atn/ATNDeserializer').ATNDeserializer;
var ATNDeserializationOptions = require('./atn/ATNDeserializationOptions').ATNDeserializationOptions;

function TraceListener() {
	ParseTreeListener.call(this);
	return this;
}

TraceListener.prototype = Object.create(ParseTreeListener);
TraceListener.prototype.constructor = TraceListener;

TraceListener.prototype.enterEveryRule = function(parser, ctx) {
	console.log("enter   " + parser.ruleNames[ctx.ruleIndex] + ", LT(1)=" + parser._input.LT(1).text);
};

TraceListener.prototype.visitTerminal = function(parser, node) {
	console.log("consume " + node.symbol + " rule " + parser.ruleNames[parser._ctx.ruleIndex]);
};

TraceListener.prototype.exitEveryRule = function(parser, ctx) {
	console.log("exit    " + parser.ruleNames[ctx.ruleIndex] + ", LT(1)=" + parser._input.LT(1).text);
};
function Parser(input) {
	Recognizer.call(this);
	this._input = null;
	this._errHandler = new DefaultErrorStrategy();
	this._precedenceStack = [];
	this._precedenceStack.push(0);
	this._ctx = null;
	this.buildParseTrees = true;
	this._tracer = null;
	this._parseListeners = null;
	this._syntaxErrors = 0;
	this.setInputStream(input);
	return this;
}

Parser.prototype = Object.create(Recognizer.prototype);
Parser.prototype.contructor = Parser;
Parser.bypassAltsAtnCache = {};
Parser.prototype.reset = function() {
	if (this._input !== null) {
		this._input.seek(0);
	}
	this._errHandler.reset(this);
	this._ctx = null;
	this._syntaxErrors = 0;
	this.setTrace(false);
	this._precedenceStack = [];
	this._precedenceStack.push(0);
	if (this._interp !== null) {
		this._interp.reset();
	}
};

Parser.prototype.match = function(ttype) {
	var t = this.getCurrentToken();
	if (t.type === ttype) {
		this._errHandler.reportMatch(this);
		this.consume();
	} else {
		t = this._errHandler.recoverInline(this);
		if (this.buildParseTrees && t.tokenIndex === -1) {
			this._ctx.addErrorNode(t);
		}
	}
	return t;
};

Parser.prototype.matchWildcard = function() {
	var t = this.getCurrentToken();
	if (t.type > 0) {
		this._errHandler.reportMatch(this);
		this.consume();
	} else {
		t = this._errHandler.recoverInline(this);
		if (this._buildParseTrees && t.tokenIndex === -1) {
			this._ctx.addErrorNode(t);
		}
	}
	return t;
};

Parser.prototype.getParseListeners = function() {
	return this._parseListeners || [];
};
Parser.prototype.addParseListener = function(listener) {
	if (listener === null) {
		throw "listener";
	}
	if (this._parseListeners === null) {
		this._parseListeners = [];
	}
	this._parseListeners.push(listener);
};
Parser.prototype.removeParseListener = function(listener) {
	if (this._parseListeners !== null) {
		var idx = this._parseListeners.indexOf(listener);
		if (idx >= 0) {
			this._parseListeners.splice(idx, 1);
		}
		if (this._parseListeners.length === 0) {
			this._parseListeners = null;
		}
	}
};
Parser.prototype.removeParseListeners = function() {
	this._parseListeners = null;
};
Parser.prototype.triggerEnterRuleEvent = function() {
	if (this._parseListeners !== null) {
		var ctx = this._ctx;
		this._parseListeners.map(function(listener) {
			listener.enterEveryRule(ctx);
			ctx.enterRule(listener);
		});
	}
};
Parser.prototype.triggerExitRuleEvent = function() {
	if (this._parseListeners !== null) {
		var ctx = this._ctx;
		this._parseListeners.slice(0).reverse().map(function(listener) {
			ctx.exitRule(listener);
			listener.exitEveryRule(ctx);
		});
	}
};

Parser.prototype.getTokenFactory = function() {
	return this._input.tokenSource._factory;
};
Parser.prototype.setTokenFactory = function(factory) {
	this._input.tokenSource._factory = factory;
};
Parser.prototype.getATNWithBypassAlts = function() {
	var serializedAtn = this.getSerializedATN();
	if (serializedAtn === null) {
		throw "The current parser does not support an ATN with bypass alternatives.";
	}
	var result = this.bypassAltsAtnCache[serializedAtn];
	if (result === null) {
		var deserializationOptions = new ATNDeserializationOptions();
		deserializationOptions.generateRuleBypassTransitions = true;
		result = new ATNDeserializer(deserializationOptions)
				.deserialize(serializedAtn);
		this.bypassAltsAtnCache[serializedAtn] = result;
	}
	return result;
};

var Lexer = require('./Lexer').Lexer;

Parser.prototype.compileParseTreePattern = function(pattern, patternRuleIndex, lexer) {
	lexer = lexer || null;
	if (lexer === null) {
		if (this.getTokenStream() !== null) {
			var tokenSource = this.getTokenStream().getTokenSource();
			if (tokenSource instanceof Lexer) {
				lexer = tokenSource;
			}
		}
	}
	if (lexer === null) {
		throw "Parser can't discover a lexer to use";
	}
	var m = new ParseTreePatternMatcher(lexer, this);
	return m.compile(pattern, patternRuleIndex);
};

Parser.prototype.getInputStream = function() {
	return this.getTokenStream();
};

Parser.prototype.setInputStream = function(input) {
	this.setTokenStream(input);
};

Parser.prototype.getTokenStream = function() {
	return this._input;
};
Parser.prototype.setTokenStream = function(input) {
	this._input = null;
	this.reset();
	this._input = input;
};
Parser.prototype.getCurrentToken = function() {
	return this._input.LT(1);
};

Parser.prototype.notifyErrorListeners = function(msg, offendingToken, err) {
	offendingToken = offendingToken || null;
	err = err || null;
	if (offendingToken === null) {
		offendingToken = this.getCurrentToken();
	}
	this._syntaxErrors += 1;
	var line = offendingToken.line;
	var column = offendingToken.column;
	var listener = this.getErrorListenerDispatch();
	listener.syntaxError(this, offendingToken, line, column, msg, err);
};
Parser.prototype.consume = function() {
	var o = this.getCurrentToken();
	if (o.type !== Token.EOF) {
		this.getInputStream().consume();
	}
	var hasListener = this._parseListeners !== null && this._parseListeners.length > 0;
	if (this.buildParseTrees || hasListener) {
		var node;
		if (this._errHandler.inErrorRecoveryMode(this)) {
			node = this._ctx.addErrorNode(o);
		} else {
			node = this._ctx.addTokenNode(o);
		}
		if (hasListener) {
			this._parseListeners.map(function(listener) {
				listener.visitTerminal(node);
			});
		}
	}
	return o;
};

Parser.prototype.addContextToParseTree = function() {
	if (this._ctx.parentCtx !== null) {
		this._ctx.parentCtx.addChild(this._ctx);
	}
};

Parser.prototype.enterRule = function(localctx, state, ruleIndex) {
	this.state = state;
	this._ctx = localctx;
	this._ctx.start = this._input.LT(1);
	if (this.buildParseTrees) {
		this.addContextToParseTree();
	}
	if (this._parseListeners !== null) {
		this.triggerEnterRuleEvent();
	}
};

Parser.prototype.exitRule = function() {
	this._ctx.stop = this._input.LT(-1);
	if (this._parseListeners !== null) {
		this.triggerExitRuleEvent();
	}
	this.state = this._ctx.invokingState;
	this._ctx = this._ctx.parentCtx;
};

Parser.prototype.enterOuterAlt = function(localctx, altNum) {
	if (this.buildParseTrees && this._ctx !== localctx) {
		if (this._ctx.parentCtx !== null) {
			this._ctx.parentCtx.removeLastChild();
			this._ctx.parentCtx.addChild(localctx);
		}
	}
	this._ctx = localctx;
};

Parser.prototype.getPrecedence = function() {
	if (this._precedenceStack.length === 0) {
		return -1;
	} else {
		return this._precedenceStack[this._precedenceStack.length-1];
	}
};

Parser.prototype.enterRecursionRule = function(localctx, state, ruleIndex,
		precedence) {
	this.state = state;
	this._precedenceStack.push(precedence);
	this._ctx = localctx;
	this._ctx.start = this._input.LT(1);
	if (this._parseListeners !== null) {
		this.triggerEnterRuleEvent(); // simulates rule entry for
	}
};

Parser.prototype.pushNewRecursionContext = function(localctx, state, ruleIndex) {
	var previous = this._ctx;
	previous.parentCtx = localctx;
	previous.invokingState = state;
	previous.stop = this._input.LT(-1);

	this._ctx = localctx;
	this._ctx.start = previous.start;
	if (this.buildParseTrees) {
		this._ctx.addChild(previous);
	}
	if (this._parseListeners !== null) {
		this.triggerEnterRuleEvent(); // simulates rule entry for
	}
};

Parser.prototype.unrollRecursionContexts = function(parentCtx) {
	this._precedenceStack.pop();
	this._ctx.stop = this._input.LT(-1);
	var retCtx = this._ctx; // save current ctx (return value)
	if (this._parseListeners !== null) {
		while (this._ctx !== parentCtx) {
			this.triggerExitRuleEvent();
			this._ctx = this._ctx.parentCtx;
		}
	} else {
		this._ctx = parentCtx;
	}
	retCtx.parentCtx = parentCtx;
	if (this.buildParseTrees && parentCtx !== null) {
		parentCtx.addChild(retCtx);
	}
};

Parser.prototype.getInvokingContext = function(ruleIndex) {
	var ctx = this._ctx;
	while (ctx !== null) {
		if (ctx.ruleIndex === ruleIndex) {
			return ctx;
		}
		ctx = ctx.parentCtx;
	}
	return null;
};

Parser.prototype.precpred = function(localctx, precedence) {
	return precedence >= this._precedenceStack[this._precedenceStack.length-1];
};

Parser.prototype.inContext = function(context) {
	return false;
};

Parser.prototype.isExpectedToken = function(symbol) {
	var atn = this._interp.atn;
	var ctx = this._ctx;
	var s = atn.states[this.state];
	var following = atn.nextTokens(s);
	if (following.contains(symbol)) {
		return true;
	}
	if (!following.contains(Token.EPSILON)) {
		return false;
	}
	while (ctx !== null && ctx.invokingState >= 0 && following.contains(Token.EPSILON)) {
		var invokingState = atn.states[ctx.invokingState];
		var rt = invokingState.transitions[0];
		following = atn.nextTokens(rt.followState);
		if (following.contains(symbol)) {
			return true;
		}
		ctx = ctx.parentCtx;
	}
	if (following.contains(Token.EPSILON) && symbol === Token.EOF) {
		return true;
	} else {
		return false;
	}
};
Parser.prototype.getExpectedTokens = function() {
	return this._interp.atn.getExpectedTokens(this.state, this._ctx);
};

Parser.prototype.getExpectedTokensWithinCurrentRule = function() {
	var atn = this._interp.atn;
	var s = atn.states[this.state];
	return atn.nextTokens(s);
};
Parser.prototype.getRuleIndex = function(ruleName) {
	var ruleIndex = this.getRuleIndexMap()[ruleName];
	if (ruleIndex !== null) {
		return ruleIndex;
	} else {
		return -1;
	}
};
Parser.prototype.getRuleInvocationStack = function(p) {
	p = p || null;
	if (p === null) {
		p = this._ctx;
	}
	var stack = [];
	while (p !== null) {
		var ruleIndex = p.ruleIndex;
		if (ruleIndex < 0) {
			stack.push("n/a");
		} else {
			stack.push(this.ruleNames[ruleIndex]);
		}
		p = p.parentCtx;
	}
	return stack;
};
Parser.prototype.getDFAStrings = function() {
	return this._interp.decisionToDFA.toString();
};
Parser.prototype.dumpDFA = function() {
	var seenOne = false;
	for (var i = 0; i < this._interp.decisionToDFA.length; i++) {
		var dfa = this._interp.decisionToDFA[i];
		if (dfa.states.length > 0) {
			if (seenOne) {
				console.log();
			}
			this.printer.println("Decision " + dfa.decision + ":");
			this.printer.print(dfa.toString(this.literalNames, this.symbolicNames));
			seenOne = true;
		}
	}
};

Parser.prototype.getSourceName = function() {
	return this._input.sourceName;
};
Parser.prototype.setTrace = function(trace) {
	if (!trace) {
		this.removeParseListener(this._tracer);
		this._tracer = null;
	} else {
		if (this._tracer !== null) {
			this.removeParseListener(this._tracer);
		}
		this._tracer = new TraceListener();
		this.addParseListener(this._tracer);
	}
};

exports.Parser = Parser;
});

define("ace/mode/cql/antlr4/index",["require","exports","module","ace/mode/cql/antlr4/tree/index","ace/mode/cql/antlr4/error/index","ace/mode/cql/antlr4/ParserRuleContext","ace/mode/cql/antlr4/atn/index","ace/mode/cql/antlr4/dfa/index","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/Token","ace/mode/cql/antlr4/InputStream","ace/mode/cql/antlr4/CommonTokenStream","ace/mode/cql/antlr4/Lexer","ace/mode/cql/antlr4/Parser","ace/mode/cql/antlr4/PredictionContext","ace/mode/cql/antlr4/IntervalSet","ace/mode/cql/antlr4/Utils"], function(require, exports, module) {
exports.tree = require('./tree/index');
exports.error = require('./error/index');
exports.ParserRuleContext = require('./ParserRuleContext').ParserRuleContext;
exports.atn = require('./atn/index');

exports.dfa = require('./dfa/index');

exports.Token = require('./Token').Token;
exports.CommonToken = require('./Token').Token;
exports.InputStream = require('./InputStream').InputStream;
exports.CommonTokenStream = require('./CommonTokenStream').CommonTokenStream;
exports.Lexer = require('./Lexer').Lexer;
exports.Parser = require('./Parser').Parser;
var pc = require('./PredictionContext');
exports.PredictionContextCache = pc.PredictionContextCache;

exports.Interval = require('./IntervalSet').Interval;
exports.Utils = require('./Utils');

});

define("ace/mode/cql/cqlLexer",["require","exports","module","ace/mode/cql/antlr4/index"], function(require, exports, module) {
var antlr4 = require('./antlr4/index');


var serializedATN = ["\3\u0430\ud6d1\u8206\uad2d\u4417\uaef1\u8d80\uaadd",
    "\2\u008d\u04d2\b\1\4\2\t\2\4\3\t\3\4\4\t\4\4\5\t\5\4\6\t\6\4\7\t\7\4",
    "\b\t\b\4\t\t\t\4\n\t\n\4\13\t\13\4\f\t\f\4\r\t\r\4\16\t\16\4\17\t\17",
    "\4\20\t\20\4\21\t\21\4\22\t\22\4\23\t\23\4\24\t\24\4\25\t\25\4\26\t",
    "\26\4\27\t\27\4\30\t\30\4\31\t\31\4\32\t\32\4\33\t\33\4\34\t\34\4\35",
    "\t\35\4\36\t\36\4\37\t\37\4 \t \4!\t!\4\"\t\"\4#\t#\4$\t$\4%\t%\4&\t",
    "&\4\'\t\'\4(\t(\4)\t)\4*\t*\4+\t+\4,\t,\4-\t-\4.\t.\4/\t/\4\60\t\60",
    "\4\61\t\61\4\62\t\62\4\63\t\63\4\64\t\64\4\65\t\65\4\66\t\66\4\67\t",
    "\67\48\t8\49\t9\4:\t:\4;\t;\4<\t<\4=\t=\4>\t>\4?\t?\4@\t@\4A\tA\4B\t",
    "B\4C\tC\4D\tD\4E\tE\4F\tF\4G\tG\4H\tH\4I\tI\4J\tJ\4K\tK\4L\tL\4M\tM",
    "\4N\tN\4O\tO\4P\tP\4Q\tQ\4R\tR\4S\tS\4T\tT\4U\tU\4V\tV\4W\tW\4X\tX\4",
    "Y\tY\4Z\tZ\4[\t[\4\\\t\\\4]\t]\4^\t^\4_\t_\4`\t`\4a\ta\4b\tb\4c\tc\4",
    "d\td\4e\te\4f\tf\4g\tg\4h\th\4i\ti\4j\tj\4k\tk\4l\tl\4m\tm\4n\tn\4o",
    "\to\4p\tp\4q\tq\4r\tr\4s\ts\4t\tt\4u\tu\4v\tv\4w\tw\4x\tx\4y\ty\4z\t",
    "z\4{\t{\4|\t|\4}\t}\4~\t~\4\177\t\177\4\u0080\t\u0080\4\u0081\t\u0081",
    "\4\u0082\t\u0082\4\u0083\t\u0083\4\u0084\t\u0084\4\u0085\t\u0085\4\u0086",
    "\t\u0086\4\u0087\t\u0087\4\u0088\t\u0088\4\u0089\t\u0089\4\u008a\t\u008a",
    "\4\u008b\t\u008b\4\u008c\t\u008c\3\2\3\2\3\2\3\2\3\2\3\2\3\2\3\2\3\3",
    "\3\3\3\3\3\3\3\3\3\3\3\3\3\3\3\4\3\4\3\4\3\4\3\4\3\4\3\5\3\5\3\5\3\5",
    "\3\5\3\5\3\5\3\5\3\6\3\6\3\6\3\6\3\6\3\6\3\6\3\7\3\7\3\7\3\7\3\7\3\7",
    "\3\7\3\b\3\b\3\b\3\b\3\b\3\b\3\b\3\b\3\t\3\t\3\t\3\t\3\t\3\t\3\t\3\t",
    "\3\t\3\t\3\n\3\n\3\n\3\n\3\n\3\n\3\n\3\n\3\13\3\13\3\13\3\13\3\13\3",
    "\13\3\13\3\13\3\13\3\13\3\13\3\f\3\f\3\r\3\r\3\r\3\r\3\r\3\r\3\r\3\r",
    "\3\r\3\16\3\16\3\16\3\16\3\16\3\16\3\16\3\16\3\16\3\16\3\16\3\16\3\17",
    "\3\17\3\20\3\20\3\21\3\21\3\22\3\22\3\23\3\23\3\23\3\23\3\23\3\24\3",
    "\24\3\25\3\25\3\26\3\26\3\26\3\26\3\26\3\26\3\26\3\26\3\26\3\27\3\27",
    "\3\27\3\27\3\27\3\27\3\30\3\30\3\31\3\31\3\32\3\32\3\32\3\32\3\32\3",
    "\32\3\32\3\33\3\33\3\33\3\33\3\33\3\33\3\33\3\33\3\34\3\34\3\34\3\34",
    "\3\34\3\34\3\34\3\34\3\34\3\35\3\35\3\35\3\35\3\35\3\36\3\36\3\36\3",
    "\36\3\36\3\36\3\36\3\36\3\36\3\36\3\37\3\37\3\37\3\37\3\37\3\37\3\37",
    "\3\37\3 \3 \3!\3!\3!\3\"\3\"\3#\3#\3#\3#\3#\3$\3$\3$\3$\3$\3$\3%\3%",
    "\3%\3%\3%\3%\3%\3&\3&\3&\3&\3\'\3\'\3\'\3\'\3\'\3\'\3\'\3\'\3\'\3(\3",
    "(\3(\3(\3(\3)\3)\3)\3*\3*\3*\3*\3+\3+\3+\3+\3+\3+\3+\3+\3+\3+\3,\3,",
    "\3,\3,\3,\3-\3-\3-\3-\3-\3-\3-\3-\3-\3-\3-\3.\3.\3.\3/\3/\3/\3/\3\60",
    "\3\60\3\60\3\60\3\60\3\61\3\61\3\61\3\61\3\61\3\62\3\62\3\62\3\62\3",
    "\62\3\62\3\63\3\63\3\63\3\64\3\64\3\64\3\64\3\64\3\65\3\65\3\65\3\65",
    "\3\65\3\65\3\65\3\66\3\66\3\66\3\66\3\66\3\66\3\66\3\66\3\66\3\67\3",
    "\67\3\67\3\67\3\67\3\67\3\67\3\67\38\38\38\38\39\39\39\39\39\39\39\3",
    "9\39\39\39\3:\3:\3:\3;\3;\3;\3<\3<\3=\3=\3=\3>\3>\3>\3>\3>\3>\3>\3>",
    "\3?\3?\3?\3?\3?\3?\3?\3?\3?\3@\3@\3@\3A\3A\3A\3A\3B\3B\3B\3B\3B\3B\3",
    "C\3C\3C\3C\3C\3C\3C\3C\3C\3C\3D\3D\3D\3D\3D\3D\3D\3E\3E\3E\3E\3E\3F",
    "\3F\3F\3F\3F\3F\3G\3G\3G\3G\3H\3H\3H\3H\3H\3I\3I\3I\3I\3I\3I\3I\3J\3",
    "J\3J\3J\3J\3J\3J\3K\3K\3K\3K\3K\3K\3K\3K\3K\3K\3K\3K\3L\3L\3L\3L\3L",
    "\3M\3M\3M\3M\3M\3N\3N\3N\3N\3N\3N\3N\3N\3N\3O\3O\3O\3O\3O\3O\3P\3P\3",
    "P\3P\3P\3P\3P\3Q\3Q\3Q\3Q\3Q\3R\3R\3R\3R\3R\3R\3S\3S\3S\3S\3S\3S\3S",
    "\3S\3T\3T\3T\3T\3T\3T\3T\3T\3U\3U\3U\3U\3U\3U\3U\3U\3U\3U\3U\3U\3U\3",
    "V\3V\3V\3V\3V\3V\3V\3V\3W\3W\3W\3X\3X\3Y\3Y\3Z\3Z\3Z\3Z\3Z\3Z\3[\3[",
    "\3[\3[\3\\\3\\\3\\\3]\3]\3]\3]\3]\3]\3]\3]\3]\3^\3^\3^\3^\3^\3^\3_\3",
    "_\3_\3_\3_\3_\3_\3_\3_\3_\3`\3`\3`\3`\3`\3`\3`\3`\3`\3`\3`\3`\3a\3a",
    "\3a\3a\3a\3a\3a\3a\3a\3a\3b\3b\3b\3b\3b\3b\3b\3b\3c\3c\3c\3c\3c\3c\3",
    "c\3c\3d\3d\3e\3e\3f\3f\3g\3g\3g\3g\3h\3h\3h\3h\3i\3i\3i\3j\3j\3j\3j",
    "\3j\3k\3k\3k\3k\3k\3l\3l\3l\3l\3l\3m\3m\3m\3m\3m\3m\3m\3m\3m\3n\3n\3",
    "n\3n\3n\3n\3n\3o\3o\3o\3o\3o\3p\3p\3p\3p\3p\3p\3p\3p\3p\3p\3q\3q\3q",
    "\3q\3q\3q\3q\3q\3q\3r\3r\3r\3r\3r\3r\3r\3r\3s\3s\3s\3s\3s\3s\3s\3s\3",
    "t\3t\3t\3t\3t\3t\3t\3u\3u\3u\3u\3u\3v\3v\3v\3v\3v\3v\3v\3w\3w\3w\3w",
    "\3w\3x\3x\3x\3x\3x\3x\3x\3x\3x\3y\3y\3y\3y\3y\3y\3y\3z\3z\3z\3z\3z\3",
    "z\3z\3z\3z\3z\3z\3z\3{\3{\3{\3{\3{\3{\3{\3|\3|\3|\3|\3|\3|\3}\3}\3}",
    "\3}\3}\3}\3}\3~\3~\3~\3~\3~\3~\3\177\3\177\3\177\3\177\3\177\3\177\3",
    "\177\3\177\3\177\3\u0080\3\u0080\3\u0080\3\u0080\3\u0080\3\u0080\3\u0080",
    "\3\u0080\3\u0081\3\u0081\3\u0081\3\u0081\3\u0081\3\u0082\3\u0082\3\u0082",
    "\3\u0082\3\u0082\3\u0082\3\u0082\3\u0082\3\u0083\5\u0083\u0437\n\u0083",
    "\3\u0083\7\u0083\u043a\n\u0083\f\u0083\16\u0083\u043d\13\u0083\3\u0084",
    "\6\u0084\u0440\n\u0084\r\u0084\16\u0084\u0441\3\u0084\3\u0084\6\u0084",
    "\u0446\n\u0084\r\u0084\16\u0084\u0447\5\u0084\u044a\n\u0084\3\u0085",
    "\3\u0085\3\u0085\3\u0085\3\u0085\3\u0085\3\u0085\3\u0085\3\u0085\3\u0085",
    "\3\u0085\3\u0085\3\u0085\3\u0085\3\u0085\3\u0085\3\u0085\3\u0085\3\u0085",
    "\3\u0085\3\u0085\3\u0085\6\u0085\u0462\n\u0085\r\u0085\16\u0085\u0463",
    "\5\u0085\u0466\n\u0085\5\u0085\u0468\n\u0085\5\u0085\u046a\n\u0085\3",
    "\u0085\3\u0085\3\u0085\3\u0085\3\u0085\3\u0085\5\u0085\u0472\n\u0085",
    "\5\u0085\u0474\n\u0085\5\u0085\u0476\n\u0085\5\u0085\u0478\n\u0085\3",
    "\u0085\5\u0085\u047b\n\u0085\3\u0086\3\u0086\3\u0086\3\u0086\3\u0086",
    "\3\u0086\3\u0086\3\u0086\3\u0086\3\u0086\3\u0086\3\u0086\6\u0086\u0489",
    "\n\u0086\r\u0086\16\u0086\u048a\5\u0086\u048d\n\u0086\5\u0086\u048f",
    "\n\u0086\5\u0086\u0491\n\u0086\3\u0086\3\u0086\3\u0086\3\u0086\3\u0086",
    "\3\u0086\3\u0086\5\u0086\u049a\n\u0086\3\u0087\3\u0087\3\u0087\3\u0087",
    "\7\u0087\u04a0\n\u0087\f\u0087\16\u0087\u04a3\13\u0087\3\u0087\3\u0087",
    "\3\u0088\3\u0088\3\u0088\3\u0088\7\u0088\u04ab\n\u0088\f\u0088\16\u0088",
    "\u04ae\13\u0088\3\u0088\3\u0088\3\u0089\3\u0089\3\u0089\3\u0089\3\u008a",
    "\3\u008a\3\u008a\3\u008a\3\u008b\3\u008b\3\u008b\3\u008b\7\u008b\u04be",
    "\n\u008b\f\u008b\16\u008b\u04c1\13\u008b\3\u008b\3\u008b\3\u008b\3\u008b",
    "\3\u008b\3\u008c\3\u008c\3\u008c\3\u008c\7\u008c\u04cc\n\u008c\f\u008c",
    "\16\u008c\u04cf\13\u008c\3\u008c\3\u008c\3\u04bf\2\u008d\3\3\5\4\7\5",
    "\t\6\13\7\r\b\17\t\21\n\23\13\25\f\27\r\31\16\33\17\35\20\37\21!\22",
    "#\23%\24\'\25)\26+\27-\30/\31\61\32\63\33\65\34\67\359\36;\37= ?!A\"",
    "C#E$G%I&K\'M(O)Q*S+U,W-Y.[/]\60_\61a\62c\63e\64g\65i\66k\67m8o9q:s;",
    "u<w=y>{?}@\177A\u0081B\u0083C\u0085D\u0087E\u0089F\u008bG\u008dH\u008f",
    "I\u0091J\u0093K\u0095L\u0097M\u0099N\u009bO\u009dP\u009fQ\u00a1R\u00a3",
    "S\u00a5T\u00a7U\u00a9V\u00abW\u00adX\u00afY\u00b1Z\u00b3[\u00b5\\\u00b7",
    "]\u00b9^\u00bb_\u00bd`\u00bfa\u00c1b\u00c3c\u00c5d\u00c7e\u00c9f\u00cb",
    "g\u00cdh\u00cfi\u00d1j\u00d3k\u00d5l\u00d7m\u00d9n\u00dbo\u00ddp\u00df",
    "q\u00e1r\u00e3s\u00e5t\u00e7u\u00e9v\u00ebw\u00edx\u00efy\u00f1z\u00f3",
    "{\u00f5|\u00f7}\u00f9~\u00fb\177\u00fd\u0080\u00ff\u0081\u0101\u0082",
    "\u0103\u0083\u0105\u0084\u0107\u0085\u0109\u0086\u010b\u0087\u010d\u0088",
    "\u010f\u0089\u0111\u008a\u0113\u008b\u0115\u008c\u0117\u008d\3\2\n\5",
    "\2C\\aac|\6\2\62;C\\aac|\3\2\62;\4\2--//\4\2$$^^\4\2))^^\5\2\13\13\17",
    "\17\"\"\4\2\f\f\17\17\u04ea\2\3\3\2\2\2\2\5\3\2\2\2\2\7\3\2\2\2\2\t",
    "\3\2\2\2\2\13\3\2\2\2\2\r\3\2\2\2\2\17\3\2\2\2\2\21\3\2\2\2\2\23\3\2",
    "\2\2\2\25\3\2\2\2\2\27\3\2\2\2\2\31\3\2\2\2\2\33\3\2\2\2\2\35\3\2\2",
    "\2\2\37\3\2\2\2\2!\3\2\2\2\2#\3\2\2\2\2%\3\2\2\2\2\'\3\2\2\2\2)\3\2",
    "\2\2\2+\3\2\2\2\2-\3\2\2\2\2/\3\2\2\2\2\61\3\2\2\2\2\63\3\2\2\2\2\65",
    "\3\2\2\2\2\67\3\2\2\2\29\3\2\2\2\2;\3\2\2\2\2=\3\2\2\2\2?\3\2\2\2\2",
    "A\3\2\2\2\2C\3\2\2\2\2E\3\2\2\2\2G\3\2\2\2\2I\3\2\2\2\2K\3\2\2\2\2M",
    "\3\2\2\2\2O\3\2\2\2\2Q\3\2\2\2\2S\3\2\2\2\2U\3\2\2\2\2W\3\2\2\2\2Y\3",
    "\2\2\2\2[\3\2\2\2\2]\3\2\2\2\2_\3\2\2\2\2a\3\2\2\2\2c\3\2\2\2\2e\3\2",
    "\2\2\2g\3\2\2\2\2i\3\2\2\2\2k\3\2\2\2\2m\3\2\2\2\2o\3\2\2\2\2q\3\2\2",
    "\2\2s\3\2\2\2\2u\3\2\2\2\2w\3\2\2\2\2y\3\2\2\2\2{\3\2\2\2\2}\3\2\2\2",
    "\2\177\3\2\2\2\2\u0081\3\2\2\2\2\u0083\3\2\2\2\2\u0085\3\2\2\2\2\u0087",
    "\3\2\2\2\2\u0089\3\2\2\2\2\u008b\3\2\2\2\2\u008d\3\2\2\2\2\u008f\3\2",
    "\2\2\2\u0091\3\2\2\2\2\u0093\3\2\2\2\2\u0095\3\2\2\2\2\u0097\3\2\2\2",
    "\2\u0099\3\2\2\2\2\u009b\3\2\2\2\2\u009d\3\2\2\2\2\u009f\3\2\2\2\2\u00a1",
    "\3\2\2\2\2\u00a3\3\2\2\2\2\u00a5\3\2\2\2\2\u00a7\3\2\2\2\2\u00a9\3\2",
    "\2\2\2\u00ab\3\2\2\2\2\u00ad\3\2\2\2\2\u00af\3\2\2\2\2\u00b1\3\2\2\2",
    "\2\u00b3\3\2\2\2\2\u00b5\3\2\2\2\2\u00b7\3\2\2\2\2\u00b9\3\2\2\2\2\u00bb",
    "\3\2\2\2\2\u00bd\3\2\2\2\2\u00bf\3\2\2\2\2\u00c1\3\2\2\2\2\u00c3\3\2",
    "\2\2\2\u00c5\3\2\2\2\2\u00c7\3\2\2\2\2\u00c9\3\2\2\2\2\u00cb\3\2\2\2",
    "\2\u00cd\3\2\2\2\2\u00cf\3\2\2\2\2\u00d1\3\2\2\2\2\u00d3\3\2\2\2\2\u00d5",
    "\3\2\2\2\2\u00d7\3\2\2\2\2\u00d9\3\2\2\2\2\u00db\3\2\2\2\2\u00dd\3\2",
    "\2\2\2\u00df\3\2\2\2\2\u00e1\3\2\2\2\2\u00e3\3\2\2\2\2\u00e5\3\2\2\2",
    "\2\u00e7\3\2\2\2\2\u00e9\3\2\2\2\2\u00eb\3\2\2\2\2\u00ed\3\2\2\2\2\u00ef",
    "\3\2\2\2\2\u00f1\3\2\2\2\2\u00f3\3\2\2\2\2\u00f5\3\2\2\2\2\u00f7\3\2",
    "\2\2\2\u00f9\3\2\2\2\2\u00fb\3\2\2\2\2\u00fd\3\2\2\2\2\u00ff\3\2\2\2",
    "\2\u0101\3\2\2\2\2\u0103\3\2\2\2\2\u0105\3\2\2\2\2\u0107\3\2\2\2\2\u0109",
    "\3\2\2\2\2\u010b\3\2\2\2\2\u010d\3\2\2\2\2\u010f\3\2\2\2\2\u0111\3\2",
    "\2\2\2\u0113\3\2\2\2\2\u0115\3\2\2\2\2\u0117\3\2\2\2\3\u0119\3\2\2\2",
    "\5\u0121\3\2\2\2\7\u0129\3\2\2\2\t\u012f\3\2\2\2\13\u0137\3\2\2\2\r",
    "\u013e\3\2\2\2\17\u0145\3\2\2\2\21\u014d\3\2\2\2\23\u0157\3\2\2\2\25",
    "\u015f\3\2\2\2\27\u016a\3\2\2\2\31\u016c\3\2\2\2\33\u0175\3\2\2\2\35",
    "\u0181\3\2\2\2\37\u0183\3\2\2\2!\u0185\3\2\2\2#\u0187\3\2\2\2%\u0189",
    "\3\2\2\2\'\u018e\3\2\2\2)\u0190\3\2\2\2+\u0192\3\2\2\2-\u019b\3\2\2",
    "\2/\u01a1\3\2\2\2\61\u01a3\3\2\2\2\63\u01a5\3\2\2\2\65\u01ac\3\2\2\2",
    "\67\u01b4\3\2\2\29\u01bd\3\2\2\2;\u01c2\3\2\2\2=\u01cc\3\2\2\2?\u01d4",
    "\3\2\2\2A\u01d6\3\2\2\2C\u01d9\3\2\2\2E\u01db\3\2\2\2G\u01e0\3\2\2\2",
    "I\u01e6\3\2\2\2K\u01ed\3\2\2\2M\u01f1\3\2\2\2O\u01fa\3\2\2\2Q\u01ff",
    "\3\2\2\2S\u0202\3\2\2\2U\u0206\3\2\2\2W\u0210\3\2\2\2Y\u0215\3\2\2\2",
    "[\u0220\3\2\2\2]\u0223\3\2\2\2_\u0227\3\2\2\2a\u022c\3\2\2\2c\u0231",
    "\3\2\2\2e\u0237\3\2\2\2g\u023a\3\2\2\2i\u023f\3\2\2\2k\u0246\3\2\2\2",
    "m\u024f\3\2\2\2o\u0257\3\2\2\2q\u025b\3\2\2\2s\u0266\3\2\2\2u\u0269",
    "\3\2\2\2w\u026c\3\2\2\2y\u026e\3\2\2\2{\u0271\3\2\2\2}\u0279\3\2\2\2",
    "\177\u0282\3\2\2\2\u0081\u0285\3\2\2\2\u0083\u0289\3\2\2\2\u0085\u028f",
    "\3\2\2\2\u0087\u0299\3\2\2\2\u0089\u02a0\3\2\2\2\u008b\u02a5\3\2\2\2",
    "\u008d\u02ab\3\2\2\2\u008f\u02af\3\2\2\2\u0091\u02b4\3\2\2\2\u0093\u02bb",
    "\3\2\2\2\u0095\u02c2\3\2\2\2\u0097\u02ce\3\2\2\2\u0099\u02d3\3\2\2\2",
    "\u009b\u02d8\3\2\2\2\u009d\u02e1\3\2\2\2\u009f\u02e7\3\2\2\2\u00a1\u02ee",
    "\3\2\2\2\u00a3\u02f3\3\2\2\2\u00a5\u02f9\3\2\2\2\u00a7\u0301\3\2\2\2",
    "\u00a9\u0309\3\2\2\2\u00ab\u0316\3\2\2\2\u00ad\u031e\3\2\2\2\u00af\u0321",
    "\3\2\2\2\u00b1\u0323\3\2\2\2\u00b3\u0325\3\2\2\2\u00b5\u032b\3\2\2\2",
    "\u00b7\u032f\3\2\2\2\u00b9\u0332\3\2\2\2\u00bb\u033b\3\2\2\2\u00bd\u0341",
    "\3\2\2\2\u00bf\u034b\3\2\2\2\u00c1\u0357\3\2\2\2\u00c3\u0361\3\2\2\2",
    "\u00c5\u0369\3\2\2\2\u00c7\u0371\3\2\2\2\u00c9\u0373\3\2\2\2\u00cb\u0375",
    "\3\2\2\2\u00cd\u0377\3\2\2\2\u00cf\u037b\3\2\2\2\u00d1\u037f\3\2\2\2",
    "\u00d3\u0382\3\2\2\2\u00d5\u0387\3\2\2\2\u00d7\u038c\3\2\2\2\u00d9\u0391",
    "\3\2\2\2\u00db\u039a\3\2\2\2\u00dd\u03a1\3\2\2\2\u00df\u03a6\3\2\2\2",
    "\u00e1\u03b0\3\2\2\2\u00e3\u03b9\3\2\2\2\u00e5\u03c1\3\2\2\2\u00e7\u03c9",
    "\3\2\2\2\u00e9\u03d0\3\2\2\2\u00eb\u03d5\3\2\2\2\u00ed\u03dc\3\2\2\2",
    "\u00ef\u03e1\3\2\2\2\u00f1\u03ea\3\2\2\2\u00f3\u03f1\3\2\2\2\u00f5\u03fd",
    "\3\2\2\2\u00f7\u0404\3\2\2\2\u00f9\u040a\3\2\2\2\u00fb\u0411\3\2\2\2",
    "\u00fd\u0417\3\2\2\2\u00ff\u0420\3\2\2\2\u0101\u0428\3\2\2\2\u0103\u042d",
    "\3\2\2\2\u0105\u0436\3\2\2\2\u0107\u043f\3\2\2\2\u0109\u044b\3\2\2\2",
    "\u010b\u047c\3\2\2\2\u010d\u049b\3\2\2\2\u010f\u04a6\3\2\2\2\u0111\u04b1",
    "\3\2\2\2\u0113\u04b5\3\2\2\2\u0115\u04b9\3\2\2\2\u0117\u04c7\3\2\2\2",
    "\u0119\u011a\7n\2\2\u011a\u011b\7k\2\2\u011b\u011c\7d\2\2\u011c\u011d",
    "\7t\2\2\u011d\u011e\7c\2\2\u011e\u011f\7t\2\2\u011f\u0120\7{\2\2\u0120",
    "\4\3\2\2\2\u0121\u0122\7x\2\2\u0122\u0123\7g\2\2\u0123\u0124\7t\2\2",
    "\u0124\u0125\7u\2\2\u0125\u0126\7k\2\2\u0126\u0127\7q\2\2\u0127\u0128",
    "\7p\2\2\u0128\6\3\2\2\2\u0129\u012a\7w\2\2\u012a\u012b\7u\2\2\u012b",
    "\u012c\7k\2\2\u012c\u012d\7p\2\2\u012d\u012e\7i\2\2\u012e\b\3\2\2\2",
    "\u012f\u0130\7k\2\2\u0130\u0131\7p\2\2\u0131\u0132\7e\2\2\u0132\u0133",
    "\7n\2\2\u0133\u0134\7w\2\2\u0134\u0135\7f\2\2\u0135\u0136\7g\2\2\u0136",
    "\n\3\2\2\2\u0137\u0138\7e\2\2\u0138\u0139\7c\2\2\u0139\u013a\7n\2\2",
    "\u013a\u013b\7n\2\2\u013b\u013c\7g\2\2\u013c\u013d\7f\2\2\u013d\f\3",
    "\2\2\2\u013e\u013f\7r\2\2\u013f\u0140\7w\2\2\u0140\u0141\7d\2\2\u0141",
    "\u0142\7n\2\2\u0142\u0143\7k\2\2\u0143\u0144\7e\2\2\u0144\16\3\2\2\2",
    "\u0145\u0146\7r\2\2\u0146\u0147\7t\2\2\u0147\u0148\7k\2\2\u0148\u0149",
    "\7x\2\2\u0149\u014a\7c\2\2\u014a\u014b\7v\2\2\u014b\u014c\7g\2\2\u014c",
    "\20\3\2\2\2\u014d\u014e\7r\2\2\u014e\u014f\7c\2\2\u014f\u0150\7t\2\2",
    "\u0150\u0151\7c\2\2\u0151\u0152\7o\2\2\u0152\u0153\7g\2\2\u0153\u0154",
    "\7v\2\2\u0154\u0155\7g\2\2\u0155\u0156\7t\2\2\u0156\22\3\2\2\2\u0157",
    "\u0158\7f\2\2\u0158\u0159\7g\2\2\u0159\u015a\7h\2\2\u015a\u015b\7c\2",
    "\2\u015b\u015c\7w\2\2\u015c\u015d\7n\2\2\u015d\u015e\7v\2\2\u015e\24",
    "\3\2\2\2\u015f\u0160\7e\2\2\u0160\u0161\7q\2\2\u0161\u0162\7f\2\2\u0162",
    "\u0163\7g\2\2\u0163\u0164\7u\2\2\u0164\u0165\7{\2\2\u0165\u0166\7u\2",
    "\2\u0166\u0167\7v\2\2\u0167\u0168\7g\2\2\u0168\u0169\7o\2\2\u0169\26",
    "\3\2\2\2\u016a\u016b\7<\2\2\u016b\30\3\2\2\2\u016c\u016d\7x\2\2\u016d",
    "\u016e\7c\2\2\u016e\u016f\7n\2\2\u016f\u0170\7w\2\2\u0170\u0171\7g\2",
    "\2\u0171\u0172\7u\2\2\u0172\u0173\7g\2\2\u0173\u0174\7v\2\2\u0174\32",
    "\3\2\2\2\u0175\u0176\7e\2\2\u0176\u0177\7q\2\2\u0177\u0178\7f\2\2\u0178",
    "\u0179\7g\2\2\u0179\u017a\7u\2\2\u017a\u017b\7{\2\2\u017b\u017c\7u\2",
    "\2\u017c\u017d\7v\2\2\u017d\u017e\7g\2\2\u017e\u017f\7o\2\2\u017f\u0180",
    "\7u\2\2\u0180\34\3\2\2\2\u0181\u0182\7*\2\2\u0182\36\3\2\2\2\u0183\u0184",
    "\7.\2\2\u0184 \3\2\2\2\u0185\u0186\7+\2\2\u0186\"\3\2\2\2\u0187\u0188",
    "\7\60\2\2\u0188$\3\2\2\2\u0189\u018a\7N\2\2\u018a\u018b\7k\2\2\u018b",
    "\u018c\7u\2\2\u018c\u018d\7v\2\2\u018d&\3\2\2\2\u018e\u018f\7>\2\2\u018f",
    "(\3\2\2\2\u0190\u0191\7@\2\2\u0191*\3\2\2\2\u0192\u0193\7K\2\2\u0193",
    "\u0194\7p\2\2\u0194\u0195\7v\2\2\u0195\u0196\7g\2\2\u0196\u0197\7t\2",
    "\2\u0197\u0198\7x\2\2\u0198\u0199\7c\2\2\u0199\u019a\7n\2\2\u019a,\3",
    "\2\2\2\u019b\u019c\7V\2\2\u019c\u019d\7w\2\2\u019d\u019e\7r\2\2\u019e",
    "\u019f\7n\2\2\u019f\u01a0\7g\2\2\u01a0.\3\2\2\2\u01a1\u01a2\7}\2\2\u01a2",
    "\60\3\2\2\2\u01a3\u01a4\7\177\2\2\u01a4\62\3\2\2\2\u01a5\u01a6\7f\2",
    "\2\u01a6\u01a7\7g\2\2\u01a7\u01a8\7h\2\2\u01a8\u01a9\7k\2\2\u01a9\u01aa",
    "\7p\2\2\u01aa\u01ab\7g\2\2\u01ab\64\3\2\2\2\u01ac\u01ad\7e\2\2\u01ad",
    "\u01ae\7q\2\2\u01ae\u01af\7p\2\2\u01af\u01b0\7v\2\2\u01b0\u01b1\7g\2",
    "\2\u01b1\u01b2\7z\2\2\u01b2\u01b3\7v\2\2\u01b3\66\3\2\2\2\u01b4\u01b5",
    "\7h\2\2\u01b5\u01b6\7w\2\2\u01b6\u01b7\7p\2\2\u01b7\u01b8\7e\2\2\u01b8",
    "\u01b9\7v\2\2\u01b9\u01ba\7k\2\2\u01ba\u01bb\7q\2\2\u01bb\u01bc\7p\2",
    "\2\u01bc8\3\2\2\2\u01bd\u01be\7y\2\2\u01be\u01bf\7k\2\2\u01bf\u01c0",
    "\7v\2\2\u01c0\u01c1\7j\2\2\u01c1:\3\2\2\2\u01c2\u01c3\7u\2\2\u01c3\u01c4",
    "\7w\2\2\u01c4\u01c5\7e\2\2\u01c5\u01c6\7j\2\2\u01c6\u01c7\7\"\2\2\u01c7",
    "\u01c8\7v\2\2\u01c8\u01c9\7j\2\2\u01c9\u01ca\7c\2\2\u01ca\u01cb\7v\2",
    "\2\u01cb<\3\2\2\2\u01cc\u01cd\7y\2\2\u01cd\u01ce\7k\2\2\u01ce\u01cf",
    "\7v\2\2\u01cf\u01d0\7j\2\2\u01d0\u01d1\7q\2\2\u01d1\u01d2\7w\2\2\u01d2",
    "\u01d3\7v\2\2\u01d3>\3\2\2\2\u01d4\u01d5\7]\2\2\u01d5@\3\2\2\2\u01d6",
    "\u01d7\7k\2\2\u01d7\u01d8\7p\2\2\u01d8B\3\2\2\2\u01d9\u01da\7_\2\2\u01da",
    "D\3\2\2\2\u01db\u01dc\7h\2\2\u01dc\u01dd\7t\2\2\u01dd\u01de\7q\2\2\u01de",
    "\u01df\7o\2\2\u01dfF\3\2\2\2\u01e0\u01e1\7y\2\2\u01e1\u01e2\7j\2\2\u01e2",
    "\u01e3\7g\2\2\u01e3\u01e4\7t\2\2\u01e4\u01e5\7g\2\2\u01e5H\3\2\2\2\u01e6",
    "\u01e7\7t\2\2\u01e7\u01e8\7g\2\2\u01e8\u01e9\7v\2\2\u01e9\u01ea\7w\2",
    "\2\u01ea\u01eb\7t\2\2\u01eb\u01ec\7p\2\2\u01ecJ\3\2\2\2\u01ed\u01ee",
    "\7c\2\2\u01ee\u01ef\7n\2\2\u01ef\u01f0\7n\2\2\u01f0L\3\2\2\2\u01f1\u01f2",
    "\7f\2\2\u01f2\u01f3\7k\2\2\u01f3\u01f4\7u\2\2\u01f4\u01f5\7v\2\2\u01f5",
    "\u01f6\7k\2\2\u01f6\u01f7\7p\2\2\u01f7\u01f8\7e\2\2\u01f8\u01f9\7v\2",
    "\2\u01f9N\3\2\2\2\u01fa\u01fb\7u\2\2\u01fb\u01fc\7q\2\2\u01fc\u01fd",
    "\7t\2\2\u01fd\u01fe\7v\2\2\u01feP\3\2\2\2\u01ff\u0200\7d\2\2\u0200\u0201",
    "\7{\2\2\u0201R\3\2\2\2\u0202\u0203\7c\2\2\u0203\u0204\7u\2\2\u0204\u0205",
    "\7e\2\2\u0205T\3\2\2\2\u0206\u0207\7c\2\2\u0207\u0208\7u\2\2\u0208\u0209",
    "\7e\2\2\u0209\u020a\7g\2\2\u020a\u020b\7p\2\2\u020b\u020c\7f\2\2\u020c",
    "\u020d\7k\2\2\u020d\u020e\7p\2\2\u020e\u020f\7i\2\2\u020fV\3\2\2\2\u0210",
    "\u0211\7f\2\2\u0211\u0212\7g\2\2\u0212\u0213\7u\2\2\u0213\u0214\7e\2",
    "\2\u0214X\3\2\2\2\u0215\u0216\7f\2\2\u0216\u0217\7g\2\2\u0217\u0218",
    "\7u\2\2\u0218\u0219\7e\2\2\u0219\u021a\7g\2\2\u021a\u021b\7p\2\2\u021b",
    "\u021c\7f\2\2\u021c\u021d\7k\2\2\u021d\u021e\7p\2\2\u021e\u021f\7i\2",
    "\2\u021fZ\3\2\2\2\u0220\u0221\7k\2\2\u0221\u0222\7u\2\2\u0222\\\3\2",
    "\2\2\u0223\u0224\7p\2\2\u0224\u0225\7q\2\2\u0225\u0226\7v\2\2\u0226",
    "^\3\2\2\2\u0227\u0228\7p\2\2\u0228\u0229\7w\2\2\u0229\u022a\7n\2\2\u022a",
    "\u022b\7n\2\2\u022b`\3\2\2\2\u022c\u022d\7v\2\2\u022d\u022e\7t\2\2\u022e",
    "\u022f\7w\2\2\u022f\u0230\7g\2\2\u0230b\3\2\2\2\u0231\u0232\7h\2\2\u0232",
    "\u0233\7c\2\2\u0233\u0234\7n\2\2\u0234\u0235\7u\2\2\u0235\u0236\7g\2",
    "\2\u0236d\3\2\2\2\u0237\u0238\7c\2\2\u0238\u0239\7u\2\2\u0239f\3\2\2",
    "\2\u023a\u023b\7e\2\2\u023b\u023c\7c\2\2\u023c\u023d\7u\2\2\u023d\u023e",
    "\7v\2\2\u023eh\3\2\2\2\u023f\u0240\7g\2\2\u0240\u0241\7z\2\2\u0241\u0242",
    "\7k\2\2\u0242\u0243\7u\2\2\u0243\u0244\7v\2\2\u0244\u0245\7u\2\2\u0245",
    "j\3\2\2\2\u0246\u0247\7r\2\2\u0247\u0248\7t\2\2\u0248\u0249\7q\2\2\u0249",
    "\u024a\7r\2\2\u024a\u024b\7g\2\2\u024b\u024c\7t\2\2\u024c\u024d\7n\2",
    "\2\u024d\u024e\7{\2\2\u024el\3\2\2\2\u024f\u0250\7d\2\2\u0250\u0251",
    "\7g\2\2\u0251\u0252\7v\2\2\u0252\u0253\7y\2\2\u0253\u0254\7g\2\2\u0254",
    "\u0255\7g\2\2\u0255\u0256\7p\2\2\u0256n\3\2\2\2\u0257\u0258\7c\2\2\u0258",
    "\u0259\7p\2\2\u0259\u025a\7f\2\2\u025ap\3\2\2\2\u025b\u025c\7f\2\2\u025c",
    "\u025d\7k\2\2\u025d\u025e\7h\2\2\u025e\u025f\7h\2\2\u025f\u0260\7g\2",
    "\2\u0260\u0261\7t\2\2\u0261\u0262\7g\2\2\u0262\u0263\7p\2\2\u0263\u0264",
    "\7e\2\2\u0264\u0265\7g\2\2\u0265r\3\2\2\2\u0266\u0267\7>\2\2\u0267\u0268",
    "\7?\2\2\u0268t\3\2\2\2\u0269\u026a\7@\2\2\u026a\u026b\7?\2\2\u026bv",
    "\3\2\2\2\u026c\u026d\7?\2\2\u026dx\3\2\2\2\u026e\u026f\7>\2\2\u026f",
    "\u0270\7@\2\2\u0270z\3\2\2\2\u0271\u0272\7o\2\2\u0272\u0273\7c\2\2\u0273",
    "\u0274\7v\2\2\u0274\u0275\7e\2\2\u0275\u0276\7j\2\2\u0276\u0277\7g\2",
    "\2\u0277\u0278\7u\2\2\u0278|\3\2\2\2\u0279\u027a\7e\2\2\u027a\u027b",
    "\7q\2\2\u027b\u027c\7p\2\2\u027c\u027d\7v\2\2\u027d\u027e\7c\2\2\u027e",
    "\u027f\7k\2\2\u027f\u0280\7p\2\2\u0280\u0281\7u\2\2\u0281~\3\2\2\2\u0282",
    "\u0283\7q\2\2\u0283\u0284\7t\2\2\u0284\u0080\3\2\2\2\u0285\u0286\7z",
    "\2\2\u0286\u0287\7q\2\2\u0287\u0288\7t\2\2\u0288\u0082\3\2\2\2\u0289",
    "\u028a\7w\2\2\u028a\u028b\7p\2\2\u028b\u028c\7k\2\2\u028c\u028d\7q\2",
    "\2\u028d\u028e\7p\2\2\u028e\u0084\3\2\2\2\u028f\u0290\7k\2\2\u0290\u0291",
    "\7p\2\2\u0291\u0292\7v\2\2\u0292\u0293\7g\2\2\u0293\u0294\7t\2\2\u0294",
    "\u0295\7u\2\2\u0295\u0296\7g\2\2\u0296\u0297\7e\2\2\u0297\u0298\7v\2",
    "\2\u0298\u0086\3\2\2\2\u0299\u029a\7g\2\2\u029a\u029b\7z\2\2\u029b\u029c",
    "\7e\2\2\u029c\u029d\7g\2\2\u029d\u029e\7r\2\2\u029e\u029f\7v\2\2\u029f",
    "\u0088\3\2\2\2\u02a0\u02a1\7{\2\2\u02a1\u02a2\7g\2\2\u02a2\u02a3\7c",
    "\2\2\u02a3\u02a4\7t\2\2\u02a4\u008a\3\2\2\2\u02a5\u02a6\7o\2\2\u02a6",
    "\u02a7\7q\2\2\u02a7\u02a8\7p\2\2\u02a8\u02a9\7v\2\2\u02a9\u02aa\7j\2",
    "\2\u02aa\u008c\3\2\2\2\u02ab\u02ac\7f\2\2\u02ac\u02ad\7c\2\2\u02ad\u02ae",
    "\7{\2\2\u02ae\u008e\3\2\2\2\u02af\u02b0\7j\2\2\u02b0\u02b1\7q\2\2\u02b1",
    "\u02b2\7w\2\2\u02b2\u02b3\7t\2\2\u02b3\u0090\3\2\2\2\u02b4\u02b5\7o",
    "\2\2\u02b5\u02b6\7k\2\2\u02b6\u02b7\7p\2\2\u02b7\u02b8\7w\2\2\u02b8",
    "\u02b9\7v\2\2\u02b9\u02ba\7g\2\2\u02ba\u0092\3\2\2\2\u02bb\u02bc\7u",
    "\2\2\u02bc\u02bd\7g\2\2\u02bd\u02be\7e\2\2\u02be\u02bf\7q\2\2\u02bf",
    "\u02c0\7p\2\2\u02c0\u02c1\7f\2\2\u02c1\u0094\3\2\2\2\u02c2\u02c3\7o",
    "\2\2\u02c3\u02c4\7k\2\2\u02c4\u02c5\7n\2\2\u02c5\u02c6\7n\2\2\u02c6",
    "\u02c7\7k\2\2\u02c7\u02c8\7u\2\2\u02c8\u02c9\7g\2\2\u02c9\u02ca\7e\2",
    "\2\u02ca\u02cb\7q\2\2\u02cb\u02cc\7p\2\2\u02cc\u02cd\7f\2\2\u02cd\u0096",
    "\3\2\2\2\u02ce\u02cf\7f\2\2\u02cf\u02d0\7c\2\2\u02d0\u02d1\7v\2\2\u02d1",
    "\u02d2\7g\2\2\u02d2\u0098\3\2\2\2\u02d3\u02d4\7v\2\2\u02d4\u02d5\7k",
    "\2\2\u02d5\u02d6\7o\2\2\u02d6\u02d7\7g\2\2\u02d7\u009a\3\2\2\2\u02d8",
    "\u02d9\7v\2\2\u02d9\u02da\7k\2\2\u02da\u02db\7o\2\2\u02db\u02dc\7g\2",
    "\2\u02dc\u02dd\7|\2\2\u02dd\u02de\7q\2\2\u02de\u02df\7p\2\2\u02df\u02e0",
    "\7g\2\2\u02e0\u009c\3\2\2\2\u02e1\u02e2\7{\2\2\u02e2\u02e3\7g\2\2\u02e3",
    "\u02e4\7c\2\2\u02e4\u02e5\7t\2\2\u02e5\u02e6\7u\2\2\u02e6\u009e\3\2",
    "\2\2\u02e7\u02e8\7o\2\2\u02e8\u02e9\7q\2\2\u02e9\u02ea\7p\2\2\u02ea",
    "\u02eb\7v\2\2\u02eb\u02ec\7j\2\2\u02ec\u02ed\7u\2\2\u02ed\u00a0\3\2",
    "\2\2\u02ee\u02ef\7f\2\2\u02ef\u02f0\7c\2\2\u02f0\u02f1\7{\2\2\u02f1",
    "\u02f2\7u\2\2\u02f2\u00a2\3\2\2\2\u02f3\u02f4\7j\2\2\u02f4\u02f5\7q",
    "\2\2\u02f5\u02f6\7w\2\2\u02f6\u02f7\7t\2\2\u02f7\u02f8\7u\2\2\u02f8",
    "\u00a4\3\2\2\2\u02f9\u02fa\7o\2\2\u02fa\u02fb\7k\2\2\u02fb\u02fc\7p",
    "\2\2\u02fc\u02fd\7w\2\2\u02fd\u02fe\7v\2\2\u02fe\u02ff\7g\2\2\u02ff",
    "\u0300\7u\2\2\u0300\u00a6\3\2\2\2\u0301\u0302\7u\2\2\u0302\u0303\7g",
    "\2\2\u0303\u0304\7e\2\2\u0304\u0305\7q\2\2\u0305\u0306\7p\2\2\u0306",
    "\u0307\7f\2\2\u0307\u0308\7u\2\2\u0308\u00a8\3\2\2\2\u0309\u030a\7o",
    "\2\2\u030a\u030b\7k\2\2\u030b\u030c\7n\2\2\u030c\u030d\7n\2\2\u030d",
    "\u030e\7k\2\2\u030e\u030f\7u\2\2\u030f\u0310\7g\2\2\u0310\u0311\7e\2",
    "\2\u0311\u0312\7q\2\2\u0312\u0313\7p\2\2\u0313\u0314\7f\2\2\u0314\u0315",
    "\7u\2\2\u0315\u00aa\3\2\2\2\u0316\u0317\7e\2\2\u0317\u0318\7q\2\2\u0318",
    "\u0319\7p\2\2\u0319\u031a\7x\2\2\u031a\u031b\7g\2\2\u031b\u031c\7t\2",
    "\2\u031c\u031d\7v\2\2\u031d\u00ac\3\2\2\2\u031e\u031f\7v\2\2\u031f\u0320",
    "\7q\2\2\u0320\u00ae\3\2\2\2\u0321\u0322\7-\2\2\u0322\u00b0\3\2\2\2\u0323",
    "\u0324\7/\2\2\u0324\u00b2\3\2\2\2\u0325\u0326\7u\2\2\u0326\u0327\7v",
    "\2\2\u0327\u0328\7c\2\2\u0328\u0329\7t\2\2\u0329\u032a\7v\2\2\u032a",
    "\u00b4\3\2\2\2\u032b\u032c\7g\2\2\u032c\u032d\7p\2\2\u032d\u032e\7f",
    "\2\2\u032e\u00b6\3\2\2\2\u032f\u0330\7q\2\2\u0330\u0331\7h\2\2\u0331",
    "\u00b8\3\2\2\2\u0332\u0333\7f\2\2\u0333\u0334\7w\2\2\u0334\u0335\7t",
    "\2\2\u0335\u0336\7c\2\2\u0336\u0337\7v\2\2\u0337\u0338\7k\2\2\u0338",
    "\u0339\7q\2\2\u0339\u033a\7p\2\2\u033a\u00ba\3\2\2\2\u033b\u033c\7y",
    "\2\2\u033c\u033d\7k\2\2\u033d\u033e\7f\2\2\u033e\u033f\7v\2\2\u033f",
    "\u0340\7j\2\2\u0340\u00bc\3\2\2\2\u0341\u0342\7u\2\2\u0342\u0343\7w",
    "\2\2\u0343\u0344\7e\2\2\u0344\u0345\7e\2\2\u0345\u0346\7g\2\2\u0346",
    "\u0347\7u\2\2\u0347\u0348\7u\2\2\u0348\u0349\7q\2\2\u0349\u034a\7t\2",
    "\2\u034a\u00be\3\2\2\2\u034b\u034c\7r\2\2\u034c\u034d\7t\2\2\u034d\u034e",
    "\7g\2\2\u034e\u034f\7f\2\2\u034f\u0350\7g\2\2\u0350\u0351\7e\2\2\u0351",
    "\u0352\7g\2\2\u0352\u0353\7u\2\2\u0353\u0354\7u\2\2\u0354\u0355\7q\2",
    "\2\u0355\u0356\7t\2\2\u0356\u00c0\3\2\2\2\u0357\u0358\7u\2\2\u0358\u0359",
    "\7k\2\2\u0359\u035a\7p\2\2\u035a\u035b\7i\2\2\u035b\u035c\7n\2\2\u035c",
    "\u035d\7g\2\2\u035d\u035e\7v\2\2\u035e\u035f\7q\2\2\u035f\u0360\7p\2",
    "\2\u0360\u00c2\3\2\2\2\u0361\u0362\7o\2\2\u0362\u0363\7k\2\2\u0363\u0364",
    "\7p\2\2\u0364\u0365\7k\2\2\u0365\u0366\7o\2\2\u0366\u0367\7w\2\2\u0367",
    "\u0368\7o\2\2\u0368\u00c4\3\2\2\2\u0369\u036a\7o\2\2\u036a\u036b\7c",
    "\2\2\u036b\u036c\7z\2\2\u036c\u036d\7k\2\2\u036d\u036e\7o\2\2\u036e",
    "\u036f\7w\2\2\u036f\u0370\7o\2\2\u0370\u00c6\3\2\2\2\u0371\u0372\7`",
    "\2\2\u0372\u00c8\3\2\2\2\u0373\u0374\7,\2\2\u0374\u00ca\3\2\2\2\u0375",
    "\u0376\7\61\2\2\u0376\u00cc\3\2\2\2\u0377\u0378\7f\2\2\u0378\u0379\7",
    "k\2\2\u0379\u037a\7x\2\2\u037a\u00ce\3\2\2\2\u037b\u037c\7o\2\2\u037c",
    "\u037d\7q\2\2\u037d\u037e\7f\2\2\u037e\u00d0\3\2\2\2\u037f\u0380\7k",
    "\2\2\u0380\u0381\7h\2\2\u0381\u00d2\3\2\2\2\u0382\u0383\7v\2\2\u0383",
    "\u0384\7j\2\2\u0384\u0385\7g\2\2\u0385\u0386\7p\2\2\u0386\u00d4\3\2",
    "\2\2\u0387\u0388\7g\2\2\u0388\u0389\7n\2\2\u0389\u038a\7u\2\2\u038a",
    "\u038b\7g\2\2\u038b\u00d6\3\2\2\2\u038c\u038d\7e\2\2\u038d\u038e\7c",
    "\2\2\u038e\u038f\7u\2\2\u038f\u0390\7g\2\2\u0390\u00d8\3\2\2\2\u0391",
    "\u0392\7e\2\2\u0392\u0393\7q\2\2\u0393\u0394\7n\2\2\u0394\u0395\7n\2",
    "\2\u0395\u0396\7c\2\2\u0396\u0397\7r\2\2\u0397\u0398\7u\2\2\u0398\u0399",
    "\7g\2\2\u0399\u00da\3\2\2\2\u039a\u039b\7g\2\2\u039b\u039c\7z\2\2\u039c",
    "\u039d\7r\2\2\u039d\u039e\7c\2\2\u039e\u039f\7p\2\2\u039f\u03a0\7f\2",
    "\2\u03a0\u00dc\3\2\2\2\u03a1\u03a2\7y\2\2\u03a2\u03a3\7j\2\2\u03a3\u03a4",
    "\7g\2\2\u03a4\u03a5\7p\2\2\u03a5\u00de\3\2\2\2\u03a6\u03a7\7q\2\2\u03a7",
    "\u03a8\7t\2\2\u03a8\u03a9\7\"\2\2\u03a9\u03aa\7d\2\2\u03aa\u03ab\7g",
    "\2\2\u03ab\u03ac\7h\2\2\u03ac\u03ad\7q\2\2\u03ad\u03ae\7t\2\2\u03ae",
    "\u03af\7g\2\2\u03af\u00e0\3\2\2\2\u03b0\u03b1\7q\2\2\u03b1\u03b2\7t",
    "\2\2\u03b2\u03b3\7\"\2\2\u03b3\u03b4\7c\2\2\u03b4\u03b5\7h\2\2\u03b5",
    "\u03b6\7v\2\2\u03b6\u03b7\7g\2\2\u03b7\u03b8\7t\2\2\u03b8\u00e2\3\2",
    "\2\2\u03b9\u03ba\7q\2\2\u03ba\u03bb\7t\2\2\u03bb\u03bc\7\"\2\2\u03bc",
    "\u03bd\7o\2\2\u03bd\u03be\7q\2\2\u03be\u03bf\7t\2\2\u03bf\u03c0\7g\2",
    "\2\u03c0\u00e4\3\2\2\2\u03c1\u03c2\7q\2\2\u03c2\u03c3\7t\2\2\u03c3\u03c4",
    "\7\"\2\2\u03c4\u03c5\7n\2\2\u03c5\u03c6\7g\2\2\u03c6\u03c7\7u\2\2\u03c7",
    "\u03c8\7u\2\2\u03c8\u00e6\3\2\2\2\u03c9\u03ca\7u\2\2\u03ca\u03cb\7v",
    "\2\2\u03cb\u03cc\7c\2\2\u03cc\u03cd\7t\2\2\u03cd\u03ce\7v\2\2\u03ce",
    "\u03cf\7u\2\2\u03cf\u00e8\3\2\2\2\u03d0\u03d1\7g\2\2\u03d1\u03d2\7p",
    "\2\2\u03d2\u03d3\7f\2\2\u03d3\u03d4\7u\2\2\u03d4\u00ea\3\2\2\2\u03d5",
    "\u03d6\7q\2\2\u03d6\u03d7\7e\2\2\u03d7\u03d8\7e\2\2\u03d8\u03d9\7w\2",
    "\2\u03d9\u03da\7t\2\2\u03da\u03db\7u\2\2\u03db\u00ec\3\2\2\2\u03dc\u03dd",
    "\7u\2\2\u03dd\u03de\7c\2\2\u03de\u03df\7o\2\2\u03df\u03e0\7g\2\2\u03e0",
    "\u00ee\3\2\2\2\u03e1\u03e2\7k\2\2\u03e2\u03e3\7p\2\2\u03e3\u03e4\7e",
    "\2\2\u03e4\u03e5\7n\2\2\u03e5\u03e6\7w\2\2\u03e6\u03e7\7f\2\2\u03e7",
    "\u03e8\7g\2\2\u03e8\u03e9\7u\2\2\u03e9\u00f0\3\2\2\2\u03ea\u03eb\7f",
    "\2\2\u03eb\u03ec\7w\2\2\u03ec\u03ed\7t\2\2\u03ed\u03ee\7k\2\2\u03ee",
    "\u03ef\7p\2\2\u03ef\u03f0\7i\2\2\u03f0\u00f2\3\2\2\2\u03f1\u03f2\7k",
    "\2\2\u03f2\u03f3\7p\2\2\u03f3\u03f4\7e\2\2\u03f4\u03f5\7n\2\2\u03f5",
    "\u03f6\7w\2\2\u03f6\u03f7\7f\2\2\u03f7\u03f8\7g\2\2\u03f8\u03f9\7f\2",
    "\2\u03f9\u03fa\7\"\2\2\u03fa\u03fb\7k\2\2\u03fb\u03fc\7p\2\2\u03fc\u00f4",
    "\3\2\2\2\u03fd\u03fe\7d\2\2\u03fe\u03ff\7g\2\2\u03ff\u0400\7h\2\2\u0400",
    "\u0401\7q\2\2\u0401\u0402\7t\2\2\u0402\u0403\7g\2\2\u0403\u00f6\3\2",
    "\2\2\u0404\u0405\7c\2\2\u0405\u0406\7h\2\2\u0406\u0407\7v\2\2\u0407",
    "\u0408\7g\2\2\u0408\u0409\7t\2\2\u0409\u00f8\3\2\2\2\u040a\u040b\7y",
    "\2\2\u040b\u040c\7k\2\2\u040c\u040d\7v\2\2\u040d\u040e\7j\2\2\u040e",
    "\u040f\7k\2\2\u040f\u0410\7p\2\2\u0410\u00fa\3\2\2\2\u0411\u0412\7o",
    "\2\2\u0412\u0413\7g\2\2\u0413\u0414\7g\2\2\u0414\u0415\7v\2\2\u0415",
    "\u0416\7u\2\2\u0416\u00fc\3\2\2\2\u0417\u0418\7q\2\2\u0418\u0419\7x",
    "\2\2\u0419\u041a\7g\2\2\u041a\u041b\7t\2\2\u041b\u041c\7n\2\2\u041c",
    "\u041d\7c\2\2\u041d\u041e\7r\2\2\u041e\u041f\7u\2\2\u041f\u00fe\3\2",
    "\2\2\u0420\u0421\7f\2\2\u0421\u0422\7k\2\2\u0422\u0423\7u\2\2\u0423",
    "\u0424\7r\2\2\u0424\u0425\7n\2\2\u0425\u0426\7c\2\2\u0426\u0427\7{\2",
    "\2\u0427\u0100\3\2\2\2\u0428\u0429\7E\2\2\u0429\u042a\7q\2\2\u042a\u042b",
    "\7f\2\2\u042b\u042c\7g\2\2\u042c\u0102\3\2\2\2\u042d\u042e\7E\2\2\u042e",
    "\u042f\7q\2\2\u042f\u0430\7p\2\2\u0430\u0431\7e\2\2\u0431\u0432\7g\2",
    "\2\u0432\u0433\7r\2\2\u0433\u0434\7v\2\2\u0434\u0104\3\2\2\2\u0435\u0437",
    "\t\2\2\2\u0436\u0435\3\2\2\2\u0437\u043b\3\2\2\2\u0438\u043a\t\3\2\2",
    "\u0439\u0438\3\2\2\2\u043a\u043d\3\2\2\2\u043b\u0439\3\2\2\2\u043b\u043c",
    "\3\2\2\2\u043c\u0106\3\2\2\2\u043d\u043b\3\2\2\2\u043e\u0440\t\4\2\2",
    "\u043f\u043e\3\2\2\2\u0440\u0441\3\2\2\2\u0441\u043f\3\2\2\2\u0441\u0442",
    "\3\2\2\2\u0442\u0449\3\2\2\2\u0443\u0445\7\60\2\2\u0444\u0446\t\4\2",
    "\2\u0445\u0444\3\2\2\2\u0446\u0447\3\2\2\2\u0447\u0445\3\2\2\2\u0447",
    "\u0448\3\2\2\2\u0448\u044a\3\2\2\2\u0449\u0443\3\2\2\2\u0449\u044a\3",
    "\2\2\2\u044a\u0108\3\2\2\2\u044b\u044c\7B\2\2\u044c\u044d\t\4\2\2\u044d",
    "\u044e\t\4\2\2\u044e\u044f\t\4\2\2\u044f\u0477\t\4\2\2\u0450\u0451\7",
    "/\2\2\u0451\u0452\t\4\2\2\u0452\u0475\t\4\2\2\u0453\u0454\7/\2\2\u0454",
    "\u0455\t\4\2\2\u0455\u0473\t\4\2\2\u0456\u0457\7V\2\2\u0457\u0458\t",
    "\4\2\2\u0458\u0469\t\4\2\2\u0459\u045a\7<\2\2\u045a\u045b\t\4\2\2\u045b",
    "\u0467\t\4\2\2\u045c\u045d\7<\2\2\u045d\u045e\t\4\2\2\u045e\u0465\t",
    "\4\2\2\u045f\u0461\7\60\2\2\u0460\u0462\t\4\2\2\u0461\u0460\3\2\2\2",
    "\u0462\u0463\3\2\2\2\u0463\u0461\3\2\2\2\u0463\u0464\3\2\2\2\u0464\u0466",
    "\3\2\2\2\u0465\u045f\3\2\2\2\u0465\u0466\3\2\2\2\u0466\u0468\3\2\2\2",
    "\u0467\u045c\3\2\2\2\u0467\u0468\3\2\2\2\u0468\u046a\3\2\2\2\u0469\u0459",
    "\3\2\2\2\u0469\u046a\3\2\2\2\u046a\u0471\3\2\2\2\u046b\u046c\t\5\2\2",
    "\u046c\u046d\t\4\2\2\u046d\u046e\t\4\2\2\u046e\u046f\7<\2\2\u046f\u0470",
    "\t\4\2\2\u0470\u0472\t\4\2\2\u0471\u046b\3\2\2\2\u0471\u0472\3\2\2\2",
    "\u0472\u0474\3\2\2\2\u0473\u0456\3\2\2\2\u0473\u0474\3\2\2\2\u0474\u0476",
    "\3\2\2\2\u0475\u0453\3\2\2\2\u0475\u0476\3\2\2\2\u0476\u0478\3\2\2\2",
    "\u0477\u0450\3\2\2\2\u0477\u0478\3\2\2\2\u0478\u047a\3\2\2\2\u0479\u047b",
    "\7\\\2\2\u047a\u0479\3\2\2\2\u047a\u047b\3\2\2\2\u047b\u010a\3\2\2\2",
    "\u047c\u047d\7B\2\2\u047d\u047e\7V\2\2\u047e\u047f\t\4\2\2\u047f\u0490",
    "\t\4\2\2\u0480\u0481\7<\2\2\u0481\u0482\t\4\2\2\u0482\u048e\t\4\2\2",
    "\u0483\u0484\7<\2\2\u0484\u0485\t\4\2\2\u0485\u048c\t\4\2\2\u0486\u0488",
    "\7\60\2\2\u0487\u0489\t\4\2\2\u0488\u0487\3\2\2\2\u0489\u048a\3\2\2",
    "\2\u048a\u0488\3\2\2\2\u048a\u048b\3\2\2\2\u048b\u048d\3\2\2\2\u048c",
    "\u0486\3\2\2\2\u048c\u048d\3\2\2\2\u048d\u048f\3\2\2\2\u048e\u0483\3",
    "\2\2\2\u048e\u048f\3\2\2\2\u048f\u0491\3\2\2\2\u0490\u0480\3\2\2\2\u0490",
    "\u0491\3\2\2\2\u0491\u0499\3\2\2\2\u0492\u049a\7\\\2\2\u0493\u0494\t",
    "\5\2\2\u0494\u0495\t\4\2\2\u0495\u0496\t\4\2\2\u0496\u0497\7<\2\2\u0497",
    "\u0498\t\4\2\2\u0498\u049a\t\4\2\2\u0499\u0492\3\2\2\2\u0499\u0493\3",
    "\2\2\2\u0499\u049a\3\2\2\2\u049a\u010c\3\2\2\2\u049b\u04a1\7$\2\2\u049c",
    "\u04a0\n\6\2\2\u049d\u049e\7$\2\2\u049e\u04a0\7$\2\2\u049f\u049c\3\2",
    "\2\2\u049f\u049d\3\2\2\2\u04a0\u04a3\3\2\2\2\u04a1\u049f\3\2\2\2\u04a1",
    "\u04a2\3\2\2\2\u04a2\u04a4\3\2\2\2\u04a3\u04a1\3\2\2\2\u04a4\u04a5\7",
    "$\2\2\u04a5\u010e\3\2\2\2\u04a6\u04ac\7)\2\2\u04a7\u04ab\n\7\2\2\u04a8",
    "\u04a9\7)\2\2\u04a9\u04ab\7)\2\2\u04aa\u04a7\3\2\2\2\u04aa\u04a8\3\2",
    "\2\2\u04ab\u04ae\3\2\2\2\u04ac\u04aa\3\2\2\2\u04ac\u04ad\3\2\2\2\u04ad",
    "\u04af\3\2\2\2\u04ae\u04ac\3\2\2\2\u04af\u04b0\7)\2\2\u04b0\u0110\3",
    "\2\2\2\u04b1\u04b2\t\b\2\2\u04b2\u04b3\3\2\2\2\u04b3\u04b4\b\u0089\2",
    "\2\u04b4\u0112\3\2\2\2\u04b5\u04b6\7\f\2\2\u04b6\u04b7\3\2\2\2\u04b7",
    "\u04b8\b\u008a\2\2\u04b8\u0114\3\2\2\2\u04b9\u04ba\7\61\2\2\u04ba\u04bb",
    "\7,\2\2\u04bb\u04bf\3\2\2\2\u04bc\u04be\13\2\2\2\u04bd\u04bc\3\2\2\2",
    "\u04be\u04c1\3\2\2\2\u04bf\u04c0\3\2\2\2\u04bf\u04bd\3\2\2\2\u04c0\u04c2",
    "\3\2\2\2\u04c1\u04bf\3\2\2\2\u04c2\u04c3\7,\2\2\u04c3\u04c4\7\61\2\2",
    "\u04c4\u04c5\3\2\2\2\u04c5\u04c6\b\u008b\3\2\u04c6\u0116\3\2\2\2\u04c7",
    "\u04c8\7\61\2\2\u04c8\u04c9\7\61\2\2\u04c9\u04cd\3\2\2\2\u04ca\u04cc",
    "\n\t\2\2\u04cb\u04ca\3\2\2\2\u04cc\u04cf\3\2\2\2\u04cd\u04cb\3\2\2\2",
    "\u04cd\u04ce\3\2\2\2\u04ce\u04d0\3\2\2\2\u04cf\u04cd\3\2\2\2\u04d0\u04d1",
    "\b\u008c\3\2\u04d1\u0118\3\2\2\2\35\2\u0436\u0439\u043b\u0441\u0447",
    "\u0449\u0463\u0465\u0467\u0469\u0471\u0473\u0475\u0477\u047a\u048a\u048c",
    "\u048e\u0490\u0499\u049f\u04a1\u04aa\u04ac\u04bf\u04cd\4\2\3\2\b\2\2"].join("");


var atn = new antlr4.atn.ATNDeserializer().deserialize(serializedATN);

var decisionsToDFA = atn.decisionToState.map( function(ds, index) { return new antlr4.dfa.DFA(ds, index); });

function cqlLexer(input) {
	antlr4.Lexer.call(this, input);
    this._interp = new antlr4.atn.LexerATNSimulator(this, atn, decisionsToDFA, new antlr4.PredictionContextCache());
    return this;
}

cqlLexer.prototype = Object.create(antlr4.Lexer.prototype);
cqlLexer.prototype.constructor = cqlLexer;

cqlLexer.EOF = antlr4.Token.EOF;
cqlLexer.T__0 = 1;
cqlLexer.T__1 = 2;
cqlLexer.T__2 = 3;
cqlLexer.T__3 = 4;
cqlLexer.T__4 = 5;
cqlLexer.T__5 = 6;
cqlLexer.T__6 = 7;
cqlLexer.T__7 = 8;
cqlLexer.T__8 = 9;
cqlLexer.T__9 = 10;
cqlLexer.T__10 = 11;
cqlLexer.T__11 = 12;
cqlLexer.T__12 = 13;
cqlLexer.T__13 = 14;
cqlLexer.T__14 = 15;
cqlLexer.T__15 = 16;
cqlLexer.T__16 = 17;
cqlLexer.T__17 = 18;
cqlLexer.T__18 = 19;
cqlLexer.T__19 = 20;
cqlLexer.T__20 = 21;
cqlLexer.T__21 = 22;
cqlLexer.T__22 = 23;
cqlLexer.T__23 = 24;
cqlLexer.T__24 = 25;
cqlLexer.T__25 = 26;
cqlLexer.T__26 = 27;
cqlLexer.T__27 = 28;
cqlLexer.T__28 = 29;
cqlLexer.T__29 = 30;
cqlLexer.T__30 = 31;
cqlLexer.T__31 = 32;
cqlLexer.T__32 = 33;
cqlLexer.T__33 = 34;
cqlLexer.T__34 = 35;
cqlLexer.T__35 = 36;
cqlLexer.T__36 = 37;
cqlLexer.T__37 = 38;
cqlLexer.T__38 = 39;
cqlLexer.T__39 = 40;
cqlLexer.T__40 = 41;
cqlLexer.T__41 = 42;
cqlLexer.T__42 = 43;
cqlLexer.T__43 = 44;
cqlLexer.T__44 = 45;
cqlLexer.T__45 = 46;
cqlLexer.T__46 = 47;
cqlLexer.T__47 = 48;
cqlLexer.T__48 = 49;
cqlLexer.T__49 = 50;
cqlLexer.T__50 = 51;
cqlLexer.T__51 = 52;
cqlLexer.T__52 = 53;
cqlLexer.T__53 = 54;
cqlLexer.T__54 = 55;
cqlLexer.T__55 = 56;
cqlLexer.T__56 = 57;
cqlLexer.T__57 = 58;
cqlLexer.T__58 = 59;
cqlLexer.T__59 = 60;
cqlLexer.T__60 = 61;
cqlLexer.T__61 = 62;
cqlLexer.T__62 = 63;
cqlLexer.T__63 = 64;
cqlLexer.T__64 = 65;
cqlLexer.T__65 = 66;
cqlLexer.T__66 = 67;
cqlLexer.T__67 = 68;
cqlLexer.T__68 = 69;
cqlLexer.T__69 = 70;
cqlLexer.T__70 = 71;
cqlLexer.T__71 = 72;
cqlLexer.T__72 = 73;
cqlLexer.T__73 = 74;
cqlLexer.T__74 = 75;
cqlLexer.T__75 = 76;
cqlLexer.T__76 = 77;
cqlLexer.T__77 = 78;
cqlLexer.T__78 = 79;
cqlLexer.T__79 = 80;
cqlLexer.T__80 = 81;
cqlLexer.T__81 = 82;
cqlLexer.T__82 = 83;
cqlLexer.T__83 = 84;
cqlLexer.T__84 = 85;
cqlLexer.T__85 = 86;
cqlLexer.T__86 = 87;
cqlLexer.T__87 = 88;
cqlLexer.T__88 = 89;
cqlLexer.T__89 = 90;
cqlLexer.T__90 = 91;
cqlLexer.T__91 = 92;
cqlLexer.T__92 = 93;
cqlLexer.T__93 = 94;
cqlLexer.T__94 = 95;
cqlLexer.T__95 = 96;
cqlLexer.T__96 = 97;
cqlLexer.T__97 = 98;
cqlLexer.T__98 = 99;
cqlLexer.T__99 = 100;
cqlLexer.T__100 = 101;
cqlLexer.T__101 = 102;
cqlLexer.T__102 = 103;
cqlLexer.T__103 = 104;
cqlLexer.T__104 = 105;
cqlLexer.T__105 = 106;
cqlLexer.T__106 = 107;
cqlLexer.T__107 = 108;
cqlLexer.T__108 = 109;
cqlLexer.T__109 = 110;
cqlLexer.T__110 = 111;
cqlLexer.T__111 = 112;
cqlLexer.T__112 = 113;
cqlLexer.T__113 = 114;
cqlLexer.T__114 = 115;
cqlLexer.T__115 = 116;
cqlLexer.T__116 = 117;
cqlLexer.T__117 = 118;
cqlLexer.T__118 = 119;
cqlLexer.T__119 = 120;
cqlLexer.T__120 = 121;
cqlLexer.T__121 = 122;
cqlLexer.T__122 = 123;
cqlLexer.T__123 = 124;
cqlLexer.T__124 = 125;
cqlLexer.T__125 = 126;
cqlLexer.T__126 = 127;
cqlLexer.T__127 = 128;
cqlLexer.T__128 = 129;
cqlLexer.IDENTIFIER = 130;
cqlLexer.QUANTITY = 131;
cqlLexer.DATETIME = 132;
cqlLexer.TIME = 133;
cqlLexer.QUOTEDIDENTIFIER = 134;
cqlLexer.STRING = 135;
cqlLexer.WS = 136;
cqlLexer.NEWLINE = 137;
cqlLexer.COMMENT = 138;
cqlLexer.LINE_COMMENT = 139;


cqlLexer.modeNames = [ "DEFAULT_MODE" ];

cqlLexer.literalNames = [ 'null', "'library'", "'version'", "'using'", "'include'", 
                          "'called'", "'public'", "'private'", "'parameter'", 
                          "'default'", "'codesystem'", "':'", "'valueset'", 
                          "'codesystems'", "'('", "','", "')'", "'.'", "'List'", 
                          "'<'", "'>'", "'Interval'", "'Tuple'", "'{'", 
                          "'}'", "'define'", "'context'", "'function'", 
                          "'with'", "'such that'", "'without'", "'['", "'in'", 
                          "']'", "'from'", "'where'", "'return'", "'all'", 
                          "'distinct'", "'sort'", "'by'", "'asc'", "'ascending'", 
                          "'desc'", "'descending'", "'is'", "'not'", "'null'", 
                          "'true'", "'false'", "'as'", "'cast'", "'exists'", 
                          "'properly'", "'between'", "'and'", "'difference'", 
                          "'<='", "'>='", "'='", "'<>'", "'matches'", "'contains'", 
                          "'or'", "'xor'", "'union'", "'intersect'", "'except'", 
                          "'year'", "'month'", "'day'", "'hour'", "'minute'", 
                          "'second'", "'millisecond'", "'date'", "'time'", 
                          "'timezone'", "'years'", "'months'", "'days'", 
                          "'hours'", "'minutes'", "'seconds'", "'milliseconds'", 
                          "'convert'", "'to'", "'+'", "'-'", "'start'", 
                          "'end'", "'of'", "'duration'", "'width'", "'successor'", 
                          "'predecessor'", "'singleton'", "'minimum'", "'maximum'", 
                          "'^'", "'*'", "'/'", "'div'", "'mod'", "'if'", 
                          "'then'", "'else'", "'case'", "'collapse'", "'expand'", 
                          "'when'", "'or before'", "'or after'", "'or more'", 
                          "'or less'", "'starts'", "'ends'", "'occurs'", 
                          "'same'", "'includes'", "'during'", "'included in'", 
                          "'before'", "'after'", "'within'", "'meets'", 
                          "'overlaps'", "'display'", "'Code'", "'Concept'" ];

cqlLexer.symbolicNames = [ 'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', 'null', 'null', 
                           'null', 'null', 'null', 'null', "IDENTIFIER", 
                           "QUANTITY", "DATETIME", "TIME", "QUOTEDIDENTIFIER", 
                           "STRING", "WS", "NEWLINE", "COMMENT", "LINE_COMMENT" ];

cqlLexer.ruleNames = [ "T__0", "T__1", "T__2", "T__3", "T__4", "T__5", "T__6", 
                       "T__7", "T__8", "T__9", "T__10", "T__11", "T__12", 
                       "T__13", "T__14", "T__15", "T__16", "T__17", "T__18", 
                       "T__19", "T__20", "T__21", "T__22", "T__23", "T__24", 
                       "T__25", "T__26", "T__27", "T__28", "T__29", "T__30", 
                       "T__31", "T__32", "T__33", "T__34", "T__35", "T__36", 
                       "T__37", "T__38", "T__39", "T__40", "T__41", "T__42", 
                       "T__43", "T__44", "T__45", "T__46", "T__47", "T__48", 
                       "T__49", "T__50", "T__51", "T__52", "T__53", "T__54", 
                       "T__55", "T__56", "T__57", "T__58", "T__59", "T__60", 
                       "T__61", "T__62", "T__63", "T__64", "T__65", "T__66", 
                       "T__67", "T__68", "T__69", "T__70", "T__71", "T__72", 
                       "T__73", "T__74", "T__75", "T__76", "T__77", "T__78", 
                       "T__79", "T__80", "T__81", "T__82", "T__83", "T__84", 
                       "T__85", "T__86", "T__87", "T__88", "T__89", "T__90", 
                       "T__91", "T__92", "T__93", "T__94", "T__95", "T__96", 
                       "T__97", "T__98", "T__99", "T__100", "T__101", "T__102", 
                       "T__103", "T__104", "T__105", "T__106", "T__107", 
                       "T__108", "T__109", "T__110", "T__111", "T__112", 
                       "T__113", "T__114", "T__115", "T__116", "T__117", 
                       "T__118", "T__119", "T__120", "T__121", "T__122", 
                       "T__123", "T__124", "T__125", "T__126", "T__127", 
                       "T__128", "IDENTIFIER", "QUANTITY", "DATETIME", "TIME", 
                       "QUOTEDIDENTIFIER", "STRING", "WS", "NEWLINE", "COMMENT", 
                       "LINE_COMMENT" ];

cqlLexer.grammarFileName = "cql.g4";



exports.cqlLexer = cqlLexer;
});

define("ace/mode/cql/cqlListener",["require","exports","module","ace/mode/cql/antlr4/index"], function(require, exports, module) {
var antlr4 = require('./antlr4/index');
function cqlListener() {
	antlr4.tree.ParseTreeListener.call(this);
  this.includes = {};// just the name and alias for now.  SHould be expandable to pull in other info from lib 
  this.models = [];  // just model names 
  this.paramteters = {}; // just name, maybe type in the meta
  this.functions = {}; // name, params?
  this.expressions = []; // just identifiers ?
  this.valuesets = []; // should be indentified as a valueset
	return this;
}



cqlListener.prototype = Object.create(antlr4.tree.ParseTreeListener.prototype);
cqlListener.prototype.constructor = cqlListener;

cqlListener.prototype.toModel = function(){
 return {includes: this.includes,
   models: this.models,
   functions: this.functions,
   expressions: this.expressions,
   valuesets: this.valuesets}
}
cqlListener.prototype.enterLogic = function(ctx) {
};
cqlListener.prototype.exitLogic = function(ctx) {
};
cqlListener.prototype.enterLibraryDefinition = function(ctx) {
};
cqlListener.prototype.exitLibraryDefinition = function(ctx) {
};
cqlListener.prototype.enterUsingDefinition = function(ctx) {
 
};
cqlListener.prototype.exitUsingDefinition = function(ctx) {
   this.models.push(ctx.identifier().stop.text);
};
cqlListener.prototype.enterIncludeDefinition = function(ctx) {
 
};
cqlListener.prototype.exitIncludeDefinition = function(ctx) {
   this.includes[ctx.identifier().stop.text] = ctx.localIdentifier() ? ctx.localIdentifier().stop.text : ctx.identifier().stop.text ;
};
cqlListener.prototype.enterLocalIdentifier = function(ctx) {
};
cqlListener.prototype.exitLocalIdentifier = function(ctx) {
};
cqlListener.prototype.enterAccessModifier = function(ctx) {
};
cqlListener.prototype.exitAccessModifier = function(ctx) {
};
cqlListener.prototype.enterParameterDefinition = function(ctx) {
 
};
cqlListener.prototype.exitParameterDefinition = function(ctx) {
   this.paramteters[ctx.identifier().stop.text] = ctx.typeSpecifier();
};
cqlListener.prototype.enterCodesystemDefinition = function(ctx) {
};
cqlListener.prototype.exitCodesystemDefinition = function(ctx) {
};
cqlListener.prototype.enterValuesetDefinition = function(ctx) {
  
};
cqlListener.prototype.exitValuesetDefinition = function(ctx) {
  this.valuesets.push(ctx.identifier().stop.text);
};
cqlListener.prototype.enterCodesystems = function(ctx) {
};
cqlListener.prototype.exitCodesystems = function(ctx) {
};
cqlListener.prototype.enterCodesystemIdentifier = function(ctx) {
};
cqlListener.prototype.exitCodesystemIdentifier = function(ctx) {
};
cqlListener.prototype.enterLibraryIdentifier = function(ctx) {
};
cqlListener.prototype.exitLibraryIdentifier = function(ctx) {
};
cqlListener.prototype.enterCodesystemId = function(ctx) {
};
cqlListener.prototype.exitCodesystemId = function(ctx) {
};
cqlListener.prototype.enterValuesetId = function(ctx) {
};
cqlListener.prototype.exitValuesetId = function(ctx) {
};
cqlListener.prototype.enterVersionSpecifier = function(ctx) {
};
cqlListener.prototype.exitVersionSpecifier = function(ctx) {
};
cqlListener.prototype.enterTypeSpecifier = function(ctx) {
};
cqlListener.prototype.exitTypeSpecifier = function(ctx) {
};
cqlListener.prototype.enterNamedTypeSpecifier = function(ctx) {
};
cqlListener.prototype.exitNamedTypeSpecifier = function(ctx) {
};
cqlListener.prototype.enterModelIdentifier = function(ctx) {
};
cqlListener.prototype.exitModelIdentifier = function(ctx) {
};
cqlListener.prototype.enterListTypeSpecifier = function(ctx) {
};
cqlListener.prototype.exitListTypeSpecifier = function(ctx) {
};
cqlListener.prototype.enterIntervalTypeSpecifier = function(ctx) {
};
cqlListener.prototype.exitIntervalTypeSpecifier = function(ctx) {
};
cqlListener.prototype.enterTupleTypeSpecifier = function(ctx) {
};
cqlListener.prototype.exitTupleTypeSpecifier = function(ctx) {
};
cqlListener.prototype.enterTupleElementDefinition = function(ctx) {
};
cqlListener.prototype.exitTupleElementDefinition = function(ctx) {
};
cqlListener.prototype.enterStatement = function(ctx) {
};
cqlListener.prototype.exitStatement = function(ctx) {
};
cqlListener.prototype.enterExpressionDefinition = function(ctx) {
};
cqlListener.prototype.exitExpressionDefinition = function(ctx) {
  this.expressions.push(ctx.identifier().stop.text);
};
cqlListener.prototype.enterContextDefinition = function(ctx) {
};
cqlListener.prototype.exitContextDefinition = function(ctx) {
};
cqlListener.prototype.enterFunctionDefinition = function(ctx) {
};
cqlListener.prototype.exitFunctionDefinition = function(ctx) {
  this.functions[ctx.identifier().stop.text] = ctx.operandDefinition().map(function(o){return [o.identifier(),o.typeSpecifier()]});
};
cqlListener.prototype.enterOperandDefinition = function(ctx) {
};
cqlListener.prototype.exitOperandDefinition = function(ctx) {
};
cqlListener.prototype.enterFunctionBody = function(ctx) {
};
cqlListener.prototype.exitFunctionBody = function(ctx) {
};
cqlListener.prototype.enterQuerySource = function(ctx) {
};
cqlListener.prototype.exitQuerySource = function(ctx) {
};
cqlListener.prototype.enterAliasedQuerySource = function(ctx) {
};
cqlListener.prototype.exitAliasedQuerySource = function(ctx) {
};
cqlListener.prototype.enterAlias = function(ctx) {
};
cqlListener.prototype.exitAlias = function(ctx) {
};
cqlListener.prototype.enterQueryInclusionClause = function(ctx) {
};
cqlListener.prototype.exitQueryInclusionClause = function(ctx) {
};
cqlListener.prototype.enterWithClause = function(ctx) {
};
cqlListener.prototype.exitWithClause = function(ctx) {
};
cqlListener.prototype.enterWithoutClause = function(ctx) {
};
cqlListener.prototype.exitWithoutClause = function(ctx) {
};
cqlListener.prototype.enterRetrieve = function(ctx) {
};
cqlListener.prototype.exitRetrieve = function(ctx) {
};
cqlListener.prototype.enterValuesetPathIdentifier = function(ctx) {
};
cqlListener.prototype.exitValuesetPathIdentifier = function(ctx) {
};
cqlListener.prototype.enterValueset = function(ctx) {
};
cqlListener.prototype.exitValueset = function(ctx) {
};
cqlListener.prototype.enterQualifier = function(ctx) {
};
cqlListener.prototype.exitQualifier = function(ctx) {
};
cqlListener.prototype.enterQuery = function(ctx) {
};
cqlListener.prototype.exitQuery = function(ctx) {
};
cqlListener.prototype.enterSourceClause = function(ctx) {
};
cqlListener.prototype.exitSourceClause = function(ctx) {
};
cqlListener.prototype.enterSingleSourceClause = function(ctx) {
};
cqlListener.prototype.exitSingleSourceClause = function(ctx) {
};
cqlListener.prototype.enterMultipleSourceClause = function(ctx) {
};
cqlListener.prototype.exitMultipleSourceClause = function(ctx) {
};
cqlListener.prototype.enterDefineClause = function(ctx) {
};
cqlListener.prototype.exitDefineClause = function(ctx) {
};
cqlListener.prototype.enterDefineClauseItem = function(ctx) {
};
cqlListener.prototype.exitDefineClauseItem = function(ctx) {
};
cqlListener.prototype.enterWhereClause = function(ctx) {
};
cqlListener.prototype.exitWhereClause = function(ctx) {
};
cqlListener.prototype.enterReturnClause = function(ctx) {
};
cqlListener.prototype.exitReturnClause = function(ctx) {
};
cqlListener.prototype.enterSortClause = function(ctx) {
};
cqlListener.prototype.exitSortClause = function(ctx) {
};
cqlListener.prototype.enterSortDirection = function(ctx) {
};
cqlListener.prototype.exitSortDirection = function(ctx) {
};
cqlListener.prototype.enterSortByItem = function(ctx) {
};
cqlListener.prototype.exitSortByItem = function(ctx) {
};
cqlListener.prototype.enterQualifiedIdentifier = function(ctx) {
};
cqlListener.prototype.exitQualifiedIdentifier = function(ctx) {
};
cqlListener.prototype.enterDurationBetweenExpression = function(ctx) {
};
cqlListener.prototype.exitDurationBetweenExpression = function(ctx) {
};
cqlListener.prototype.enterInFixSetExpression = function(ctx) {
};
cqlListener.prototype.exitInFixSetExpression = function(ctx) {
};
cqlListener.prototype.enterRetrieveExpression = function(ctx) {
};
cqlListener.prototype.exitRetrieveExpression = function(ctx) {
};
cqlListener.prototype.enterTimingExpression = function(ctx) {
};
cqlListener.prototype.exitTimingExpression = function(ctx) {
};
cqlListener.prototype.enterNotExpression = function(ctx) {
};
cqlListener.prototype.exitNotExpression = function(ctx) {
};
cqlListener.prototype.enterQueryExpression = function(ctx) {
};
cqlListener.prototype.exitQueryExpression = function(ctx) {
};
cqlListener.prototype.enterBooleanExpression = function(ctx) {
};
cqlListener.prototype.exitBooleanExpression = function(ctx) {
};
cqlListener.prototype.enterOrExpression = function(ctx) {
};
cqlListener.prototype.exitOrExpression = function(ctx) {
};
cqlListener.prototype.enterCastExpression = function(ctx) {
};
cqlListener.prototype.exitCastExpression = function(ctx) {
};
cqlListener.prototype.enterAndExpression = function(ctx) {
};
cqlListener.prototype.exitAndExpression = function(ctx) {
};
cqlListener.prototype.enterBetweenExpression = function(ctx) {
};
cqlListener.prototype.exitBetweenExpression = function(ctx) {
};
cqlListener.prototype.enterMembershipExpression = function(ctx) {
};
cqlListener.prototype.exitMembershipExpression = function(ctx) {
};
cqlListener.prototype.enterDifferenceBetweenExpression = function(ctx) {
};
cqlListener.prototype.exitDifferenceBetweenExpression = function(ctx) {
};
cqlListener.prototype.enterInequalityExpression = function(ctx) {
};
cqlListener.prototype.exitInequalityExpression = function(ctx) {
};
cqlListener.prototype.enterEqualityExpression = function(ctx) {
};
cqlListener.prototype.exitEqualityExpression = function(ctx) {
};
cqlListener.prototype.enterExistenceExpression = function(ctx) {
};
cqlListener.prototype.exitExistenceExpression = function(ctx) {
};
cqlListener.prototype.enterTermExpression = function(ctx) {
};
cqlListener.prototype.exitTermExpression = function(ctx) {
};
cqlListener.prototype.enterTypeExpression = function(ctx) {
};
cqlListener.prototype.exitTypeExpression = function(ctx) {
};
cqlListener.prototype.enterDateTimePrecision = function(ctx) {
};
cqlListener.prototype.exitDateTimePrecision = function(ctx) {
};
cqlListener.prototype.enterDateTimeComponent = function(ctx) {
};
cqlListener.prototype.exitDateTimeComponent = function(ctx) {
};
cqlListener.prototype.enterPluralDateTimePrecision = function(ctx) {
};
cqlListener.prototype.exitPluralDateTimePrecision = function(ctx) {
};
cqlListener.prototype.enterAdditionExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitAdditionExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterIndexedExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitIndexedExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterWidthExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitWidthExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterTimeUnitExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitTimeUnitExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterIfThenElseExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitIfThenElseExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterTimeBoundaryExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitTimeBoundaryExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterElementExtractorExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitElementExtractorExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterConversionExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitConversionExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterTypeExtentExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitTypeExtentExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterPredecessorExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitPredecessorExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterAccessorExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitAccessorExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterMultiplicationExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitMultiplicationExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterAggregateExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitAggregateExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterDurationExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitDurationExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterCaseExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitCaseExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterPowerExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitPowerExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterSuccessorExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitSuccessorExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterPolarityExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitPolarityExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterTermExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitTermExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterInvocationExpressionTerm = function(ctx) {
};
cqlListener.prototype.exitInvocationExpressionTerm = function(ctx) {
};
cqlListener.prototype.enterCaseExpressionItem = function(ctx) {
};
cqlListener.prototype.exitCaseExpressionItem = function(ctx) {
};
cqlListener.prototype.enterDateTimePrecisionSpecifier = function(ctx) {
};
cqlListener.prototype.exitDateTimePrecisionSpecifier = function(ctx) {
};
cqlListener.prototype.enterRelativeQualifier = function(ctx) {
};
cqlListener.prototype.exitRelativeQualifier = function(ctx) {
};
cqlListener.prototype.enterOffsetRelativeQualifier = function(ctx) {
};
cqlListener.prototype.exitOffsetRelativeQualifier = function(ctx) {
};
cqlListener.prototype.enterQuantityOffset = function(ctx) {
};
cqlListener.prototype.exitQuantityOffset = function(ctx) {
};
cqlListener.prototype.enterConcurrentWithIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.exitConcurrentWithIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.enterIncludesIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.exitIncludesIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.enterIncludedInIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.exitIncludedInIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.enterBeforeOrAfterIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.exitBeforeOrAfterIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.enterWithinIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.exitWithinIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.enterMeetsIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.exitMeetsIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.enterOverlapsIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.exitOverlapsIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.enterStartsIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.exitStartsIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.enterEndsIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.exitEndsIntervalOperatorPhrase = function(ctx) {
};
cqlListener.prototype.enterIdentifierTerm = function(ctx) {
};
cqlListener.prototype.exitIdentifierTerm = function(ctx) {
};
cqlListener.prototype.enterLiteralTerm = function(ctx) {
};
cqlListener.prototype.exitLiteralTerm = function(ctx) {
};
cqlListener.prototype.enterIntervalSelectorTerm = function(ctx) {
};
cqlListener.prototype.exitIntervalSelectorTerm = function(ctx) {
};
cqlListener.prototype.enterTupleSelectorTerm = function(ctx) {
};
cqlListener.prototype.exitTupleSelectorTerm = function(ctx) {
};
cqlListener.prototype.enterInstanceSelectorTerm = function(ctx) {
};
cqlListener.prototype.exitInstanceSelectorTerm = function(ctx) {
};
cqlListener.prototype.enterListSelectorTerm = function(ctx) {
};
cqlListener.prototype.exitListSelectorTerm = function(ctx) {
};
cqlListener.prototype.enterCodeSelectorTerm = function(ctx) {
};
cqlListener.prototype.exitCodeSelectorTerm = function(ctx) {
};
cqlListener.prototype.enterConceptSelectorTerm = function(ctx) {
};
cqlListener.prototype.exitConceptSelectorTerm = function(ctx) {
};
cqlListener.prototype.enterParenthesizedTerm = function(ctx) {
};
cqlListener.prototype.exitParenthesizedTerm = function(ctx) {
};
cqlListener.prototype.enterIntervalSelector = function(ctx) {
};
cqlListener.prototype.exitIntervalSelector = function(ctx) {
};
cqlListener.prototype.enterTupleSelector = function(ctx) {
};
cqlListener.prototype.exitTupleSelector = function(ctx) {
};
cqlListener.prototype.enterTupleElementSelector = function(ctx) {
};
cqlListener.prototype.exitTupleElementSelector = function(ctx) {
};
cqlListener.prototype.enterInstanceSelector = function(ctx) {
};
cqlListener.prototype.exitInstanceSelector = function(ctx) {
};
cqlListener.prototype.enterInstanceElementSelector = function(ctx) {
};
cqlListener.prototype.exitInstanceElementSelector = function(ctx) {
};
cqlListener.prototype.enterListSelector = function(ctx) {
};
cqlListener.prototype.exitListSelector = function(ctx) {
};
cqlListener.prototype.enterDisplayClause = function(ctx) {
};
cqlListener.prototype.exitDisplayClause = function(ctx) {
};
cqlListener.prototype.enterCodeSelector = function(ctx) {
};
cqlListener.prototype.exitCodeSelector = function(ctx) {
};
cqlListener.prototype.enterConceptSelector = function(ctx) {
};
cqlListener.prototype.exitConceptSelector = function(ctx) {
};
cqlListener.prototype.enterLiteral = function(ctx) {
};
cqlListener.prototype.exitLiteral = function(ctx) {
};
cqlListener.prototype.enterNullLiteral = function(ctx) {
};
cqlListener.prototype.exitNullLiteral = function(ctx) {
};
cqlListener.prototype.enterBooleanLiteral = function(ctx) {
};
cqlListener.prototype.exitBooleanLiteral = function(ctx) {
};
cqlListener.prototype.enterStringLiteral = function(ctx) {
};
cqlListener.prototype.exitStringLiteral = function(ctx) {
};
cqlListener.prototype.enterDateTimeLiteral = function(ctx) {
};
cqlListener.prototype.exitDateTimeLiteral = function(ctx) {
};
cqlListener.prototype.enterTimeLiteral = function(ctx) {
};
cqlListener.prototype.exitTimeLiteral = function(ctx) {
};
cqlListener.prototype.enterQuantityLiteral = function(ctx) {
};
cqlListener.prototype.exitQuantityLiteral = function(ctx) {
};
cqlListener.prototype.enterUnit = function(ctx) {
};
cqlListener.prototype.exitUnit = function(ctx) {
};
cqlListener.prototype.enterIdentifier = function(ctx) {
};
cqlListener.prototype.exitIdentifier = function(ctx) {
};



exports.cqlListener = cqlListener;
});

define("ace/mode/cql/cqlParser",["require","exports","module","ace/mode/cql/antlr4/index","ace/mode/cql/cqlListener"], function(require, exports, module) {
var antlr4 = require('./antlr4/index');
var cqlListener = require('./cqlListener').cqlListener;
var grammarFileName = "cql.g4";

var serializedATN = ["\3\u0430\ud6d1\u8206\uad2d\u4417\uaef1\u8d80\uaadd",
    "\3\u008d\u039e\4\2\t\2\4\3\t\3\4\4\t\4\4\5\t\5\4\6\t\6\4\7\t\7\4\b\t",
    "\b\4\t\t\t\4\n\t\n\4\13\t\13\4\f\t\f\4\r\t\r\4\16\t\16\4\17\t\17\4\20",
    "\t\20\4\21\t\21\4\22\t\22\4\23\t\23\4\24\t\24\4\25\t\25\4\26\t\26\4",
    "\27\t\27\4\30\t\30\4\31\t\31\4\32\t\32\4\33\t\33\4\34\t\34\4\35\t\35",
    "\4\36\t\36\4\37\t\37\4 \t \4!\t!\4\"\t\"\4#\t#\4$\t$\4%\t%\4&\t&\4\'",
    "\t\'\4(\t(\4)\t)\4*\t*\4+\t+\4,\t,\4-\t-\4.\t.\4/\t/\4\60\t\60\4\61",
    "\t\61\4\62\t\62\4\63\t\63\4\64\t\64\4\65\t\65\4\66\t\66\4\67\t\67\4",
    "8\t8\49\t9\4:\t:\4;\t;\4<\t<\4=\t=\4>\t>\4?\t?\4@\t@\4A\tA\4B\tB\4C",
    "\tC\4D\tD\4E\tE\4F\tF\4G\tG\4H\tH\4I\tI\4J\tJ\4K\tK\4L\tL\4M\tM\4N\t",
    "N\4O\tO\4P\tP\4Q\tQ\3\2\5\2\u00a4\n\2\3\2\7\2\u00a7\n\2\f\2\16\2\u00aa",
    "\13\2\3\2\7\2\u00ad\n\2\f\2\16\2\u00b0\13\2\3\2\7\2\u00b3\n\2\f\2\16",
    "\2\u00b6\13\2\3\2\7\2\u00b9\n\2\f\2\16\2\u00bc\13\2\3\2\7\2\u00bf\n",
    "\2\f\2\16\2\u00c2\13\2\3\2\6\2\u00c5\n\2\r\2\16\2\u00c6\3\3\3\3\3\3",
    "\3\3\5\3\u00cd\n\3\3\4\3\4\3\4\3\4\5\4\u00d3\n\4\3\5\3\5\3\5\3\5\5\5",
    "\u00d9\n\5\3\5\3\5\3\5\3\6\3\6\3\7\3\7\3\b\5\b\u00e3\n\b\3\b\3\b\3\b",
    "\5\b\u00e8\n\b\3\b\3\b\5\b\u00ec\n\b\3\t\5\t\u00ef\n\t\3\t\3\t\3\t\3",
    "\t\3\t\3\t\5\t\u00f7\n\t\3\n\5\n\u00fa\n\n\3\n\3\n\3\n\3\n\3\n\3\n\5",
    "\n\u0102\n\n\3\n\5\n\u0105\n\n\3\13\3\13\3\13\3\13\3\13\7\13\u010c\n",
    "\13\f\13\16\13\u010f\13\13\3\13\3\13\3\f\3\f\3\f\5\f\u0116\n\f\3\f\3",
    "\f\3\r\3\r\3\16\3\16\3\17\3\17\3\20\3\20\3\21\3\21\3\21\3\21\5\21\u0126",
    "\n\21\3\22\3\22\3\22\5\22\u012b\n\22\3\22\3\22\3\23\3\23\3\24\3\24\3",
    "\24\3\24\3\24\3\25\3\25\3\25\3\25\3\25\3\26\3\26\3\26\3\26\3\26\7\26",
    "\u0140\n\26\f\26\16\26\u0143\13\26\3\26\3\26\3\27\3\27\3\27\3\30\3\30",
    "\3\30\5\30\u014d\n\30\3\31\3\31\5\31\u0151\n\31\3\31\3\31\3\31\3\31",
    "\3\32\3\32\3\32\3\33\3\33\5\33\u015c\n\33\3\33\3\33\3\33\3\33\3\33\3",
    "\33\7\33\u0164\n\33\f\33\16\33\u0167\13\33\5\33\u0169\n\33\3\33\3\33",
    "\3\33\3\33\3\34\3\34\3\34\3\35\3\35\3\36\3\36\3\36\3\36\3\36\3\36\5",
    "\36\u017a\n\36\3\37\3\37\3\37\3 \3 \3!\3!\5!\u0183\n!\3\"\3\"\3\"\3",
    "\"\3\"\3#\3#\3#\3#\3#\3$\3$\3$\3$\3$\3$\5$\u0195\n$\3$\5$\u0198\n$\3",
    "$\3$\3%\3%\3&\3&\3\'\3\'\3(\3(\5(\u01a4\n(\3(\7(\u01a7\n(\f(\16(\u01aa",
    "\13(\3(\5(\u01ad\n(\3(\5(\u01b0\n(\3(\5(\u01b3\n(\3)\3)\5)\u01b7\n)",
    "\3*\3*\3+\3+\3+\3+\7+\u01bf\n+\f+\16+\u01c2\13+\3,\3,\3,\3,\7,\u01c8",
    "\n,\f,\16,\u01cb\13,\3-\3-\3-\3-\3.\3.\3.\3/\3/\5/\u01d6\n/\3/\3/\3",
    "\60\3\60\3\60\3\60\3\60\3\60\7\60\u01e0\n\60\f\60\16\60\u01e3\13\60",
    "\5\60\u01e5\n\60\3\61\3\61\3\62\3\62\5\62\u01eb\n\62\3\63\3\63\3\63",
    "\7\63\u01f0\n\63\f\63\16\63\u01f3\13\63\3\63\3\63\3\64\3\64\3\64\3\64",
    "\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3",
    "\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\5\64\u0212\n\64\3\64",
    "\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\5\64\u0221",
    "\n\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3\64\3",
    "\64\5\64\u0230\n\64\3\64\3\64\3\64\3\64\3\64\3\64\5\64\u0238\n\64\3",
    "\64\3\64\3\64\3\64\3\64\7\64\u023f\n\64\f\64\16\64\u0242\13\64\3\65",
    "\3\65\3\66\3\66\3\66\3\66\5\66\u024a\n\66\3\67\3\67\38\38\38\38\38\3",
    "8\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38",
    "\38\38\38\38\58\u026e\n8\38\38\38\38\38\78\u0275\n8\f8\168\u0278\13",
    "8\58\u027a\n8\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38",
    "\58\u028e\n8\38\68\u0291\n8\r8\168\u0292\38\38\38\38\38\38\58\u029b",
    "\n8\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\38\78\u02ae\n8\f",
    "8\168\u02b1\138\39\39\39\39\39\3:\3:\3:\3;\3;\3<\3<\3=\3=\5=\u02c1\n",
    "=\3>\5>\u02c4\n>\3>\3>\5>\u02c8\n>\3>\3>\5>\u02cc\n>\3>\5>\u02cf\n>",
    "\3>\5>\u02d2\n>\3>\3>\5>\u02d6\n>\3>\5>\u02d9\n>\3>\5>\u02dc\n>\3>\5",
    ">\u02df\n>\3>\3>\5>\u02e3\n>\3>\5>\u02e6\n>\3>\5>\u02e9\n>\3>\3>\5>",
    "\u02ed\n>\3>\5>\u02f0\n>\3>\5>\u02f3\n>\3>\5>\u02f6\n>\3>\3>\3>\3>\5",
    ">\u02fc\n>\3>\3>\5>\u0300\n>\3>\5>\u0303\n>\3>\3>\5>\u0307\n>\3>\5>",
    "\u030a\n>\3>\3>\5>\u030e\n>\3>\3>\5>\u0312\n>\5>\u0314\n>\3?\3?\3?\3",
    "?\3?\3?\3?\3?\3?\3?\3?\3?\5?\u0322\n?\3@\3@\3@\3@\3@\3@\3@\3A\5A\u032c",
    "\nA\3A\3A\3A\3A\3A\7A\u0333\nA\fA\16A\u0336\13A\5A\u0338\nA\3A\3A\3",
    "B\3B\3B\3B\3C\3C\3C\3C\3C\3C\7C\u0346\nC\fC\16C\u0349\13C\5C\u034b\n",
    "C\3C\3C\3D\3D\3D\3D\3E\3E\3E\3E\3E\5E\u0358\nE\5E\u035a\nE\3E\3E\3E",
    "\3E\7E\u0360\nE\fE\16E\u0363\13E\5E\u0365\nE\3E\3E\3F\3F\3F\3G\3G\3",
    "G\3G\3G\5G\u0371\nG\3H\3H\3H\3H\3H\7H\u0378\nH\fH\16H\u037b\13H\3H\3",
    "H\5H\u037f\nH\3I\3I\3I\3I\3I\3I\5I\u0387\nI\3J\3J\3K\3K\3L\3L\3M\3M",
    "\3N\3N\3O\3O\5O\u0395\nO\3P\3P\3P\5P\u039a\nP\3Q\3Q\3Q\2\4fnR\2\4\6",
    "\b\n\f\16\20\22\24\26\30\32\34\36 \"$&(*,.\60\62\64\668:<>@BDFHJLNP",
    "RTVXZ\\^`bdfhjlnprtvxz|~\u0080\u0082\u0084\u0086\u0088\u008a\u008c\u008e",
    "\u0090\u0092\u0094\u0096\u0098\u009a\u009c\u009e\u00a0\2\34\3\2\b\t",
    "\3\2\'(\3\2+.\4\2\25\26;<\3\2=?\4\2\"\"@@\3\2AB\3\2CE\3\2\61\63\4\2",
    "//\64\64\3\2FL\3\2PV\3\2YZ\3\2[\\\3\2cd\4\2((no\3\2fi\3\2qr\3\2st\3",
    "\2uw\3\2z{\3\2|}\4\2\20\20!!\4\2\22\22##\3\2\62\63\6\2\4\4MO\u0081\u0084",
    "\u0088\u0088\u03e9\2\u00a3\3\2\2\2\4\u00c8\3\2\2\2\6\u00ce\3\2\2\2\b",
    "\u00d4\3\2\2\2\n\u00dd\3\2\2\2\f\u00df\3\2\2\2\16\u00e2\3\2\2\2\20\u00ee",
    "\3\2\2\2\22\u00f9\3\2\2\2\24\u0106\3\2\2\2\26\u0115\3\2\2\2\30\u0119",
    "\3\2\2\2\32\u011b\3\2\2\2\34\u011d\3\2\2\2\36\u011f\3\2\2\2 \u0125\3",
    "\2\2\2\"\u012a\3\2\2\2$\u012e\3\2\2\2&\u0130\3\2\2\2(\u0135\3\2\2\2",
    "*\u013a\3\2\2\2,\u0146\3\2\2\2.\u014c\3\2\2\2\60\u014e\3\2\2\2\62\u0156",
    "\3\2\2\2\64\u0159\3\2\2\2\66\u016e\3\2\2\28\u0171\3\2\2\2:\u0179\3\2",
    "\2\2<\u017b\3\2\2\2>\u017e\3\2\2\2@\u0182\3\2\2\2B\u0184\3\2\2\2D\u0189",
    "\3\2\2\2F\u018e\3\2\2\2H\u019b\3\2\2\2J\u019d\3\2\2\2L\u019f\3\2\2\2",
    "N\u01a1\3\2\2\2P\u01b6\3\2\2\2R\u01b8\3\2\2\2T\u01ba\3\2\2\2V\u01c3",
    "\3\2\2\2X\u01cc\3\2\2\2Z\u01d0\3\2\2\2\\\u01d3\3\2\2\2^\u01d9\3\2\2",
    "\2`\u01e6\3\2\2\2b\u01e8\3\2\2\2d\u01f1\3\2\2\2f\u0211\3\2\2\2h\u0243",
    "\3\2\2\2j\u0249\3\2\2\2l\u024b\3\2\2\2n\u029a\3\2\2\2p\u02b2\3\2\2\2",
    "r\u02b7\3\2\2\2t\u02ba\3\2\2\2v\u02bc\3\2\2\2x\u02be\3\2\2\2z\u0313",
    "\3\2\2\2|\u0321\3\2\2\2~\u0323\3\2\2\2\u0080\u032b\3\2\2\2\u0082\u033b",
    "\3\2\2\2\u0084\u033f\3\2\2\2\u0086\u034e\3\2\2\2\u0088\u0359\3\2\2\2",
    "\u008a\u0368\3\2\2\2\u008c\u036b\3\2\2\2\u008e\u0372\3\2\2\2\u0090\u0386",
    "\3\2\2\2\u0092\u0388\3\2\2\2\u0094\u038a\3\2\2\2\u0096\u038c\3\2\2\2",
    "\u0098\u038e\3\2\2\2\u009a\u0390\3\2\2\2\u009c\u0392\3\2\2\2\u009e\u0399",
    "\3\2\2\2\u00a0\u039b\3\2\2\2\u00a2\u00a4\5\4\3\2\u00a3\u00a2\3\2\2\2",
    "\u00a3\u00a4\3\2\2\2\u00a4\u00a8\3\2\2\2\u00a5\u00a7\5\6\4\2\u00a6\u00a5",
    "\3\2\2\2\u00a7\u00aa\3\2\2\2\u00a8\u00a6\3\2\2\2\u00a8\u00a9\3\2\2\2",
    "\u00a9\u00ae\3\2\2\2\u00aa\u00a8\3\2\2\2\u00ab\u00ad\5\b\5\2\u00ac\u00ab",
    "\3\2\2\2\u00ad\u00b0\3\2\2\2\u00ae\u00ac\3\2\2\2\u00ae\u00af\3\2\2\2",
    "\u00af\u00b4\3\2\2\2\u00b0\u00ae\3\2\2\2\u00b1\u00b3\5\20\t\2\u00b2",
    "\u00b1\3\2\2\2\u00b3\u00b6\3\2\2\2\u00b4\u00b2\3\2\2\2\u00b4\u00b5\3",
    "\2\2\2\u00b5\u00ba\3\2\2\2\u00b6\u00b4\3\2\2\2\u00b7\u00b9\5\22\n\2",
    "\u00b8\u00b7\3\2\2\2\u00b9\u00bc\3\2\2\2\u00ba\u00b8\3\2\2\2\u00ba\u00bb",
    "\3\2\2\2\u00bb\u00c0\3\2\2\2\u00bc\u00ba\3\2\2\2\u00bd\u00bf\5\16\b",
    "\2\u00be\u00bd\3\2\2\2\u00bf\u00c2\3\2\2\2\u00c0\u00be\3\2\2\2\u00c0",
    "\u00c1\3\2\2\2\u00c1\u00c4\3\2\2\2\u00c2\u00c0\3\2\2\2\u00c3\u00c5\5",
    ".\30\2\u00c4\u00c3\3\2\2\2\u00c5\u00c6\3\2\2\2\u00c6\u00c4\3\2\2\2\u00c6",
    "\u00c7\3\2\2\2\u00c7\3\3\2\2\2\u00c8\u00c9\7\3\2\2\u00c9\u00cc\5\u00a0",
    "Q\2\u00ca\u00cb\7\4\2\2\u00cb\u00cd\5\36\20\2\u00cc\u00ca\3\2\2\2\u00cc",
    "\u00cd\3\2\2\2\u00cd\5\3\2\2\2\u00ce\u00cf\7\5\2\2\u00cf\u00d2\5\u00a0",
    "Q\2\u00d0\u00d1\7\4\2\2\u00d1\u00d3\5\36\20\2\u00d2\u00d0\3\2\2\2\u00d2",
    "\u00d3\3\2\2\2\u00d3\7\3\2\2\2\u00d4\u00d5\7\6\2\2\u00d5\u00d8\5\u00a0",
    "Q\2\u00d6\u00d7\7\4\2\2\u00d7\u00d9\5\36\20\2\u00d8\u00d6\3\2\2\2\u00d8",
    "\u00d9\3\2\2\2\u00d9\u00da\3\2\2\2\u00da\u00db\7\7\2\2\u00db\u00dc\5",
    "\n\6\2\u00dc\t\3\2\2\2\u00dd\u00de\5\u00a0Q\2\u00de\13\3\2\2\2\u00df",
    "\u00e0\t\2\2\2\u00e0\r\3\2\2\2\u00e1\u00e3\5\f\7\2\u00e2\u00e1\3\2\2",
    "\2\u00e2\u00e3\3\2\2\2\u00e3\u00e4\3\2\2\2\u00e4\u00e5\7\n\2\2\u00e5",
    "\u00e7\5\u00a0Q\2\u00e6\u00e8\5 \21\2\u00e7\u00e6\3\2\2\2\u00e7\u00e8",
    "\3\2\2\2\u00e8\u00eb\3\2\2\2\u00e9\u00ea\7\13\2\2\u00ea\u00ec\5f\64",
    "\2\u00eb\u00e9\3\2\2\2\u00eb\u00ec\3\2\2\2\u00ec\17\3\2\2\2\u00ed\u00ef",
    "\5\f\7\2\u00ee\u00ed\3\2\2\2\u00ee\u00ef\3\2\2\2\u00ef\u00f0\3\2\2\2",
    "\u00f0\u00f1\7\f\2\2\u00f1\u00f2\5\u00a0Q\2\u00f2\u00f3\7\r\2\2\u00f3",
    "\u00f6\5\32\16\2\u00f4\u00f5\7\4\2\2\u00f5\u00f7\5\36\20\2\u00f6\u00f4",
    "\3\2\2\2\u00f6\u00f7\3\2\2\2\u00f7\21\3\2\2\2\u00f8\u00fa\5\f\7\2\u00f9",
    "\u00f8\3\2\2\2\u00f9\u00fa\3\2\2\2\u00fa\u00fb\3\2\2\2\u00fb\u00fc\7",
    "\16\2\2\u00fc\u00fd\5\u00a0Q\2\u00fd\u00fe\7\r\2\2\u00fe\u0101\5\34",
    "\17\2\u00ff\u0100\7\4\2\2\u0100\u0102\5\36\20\2\u0101\u00ff\3\2\2\2",
    "\u0101\u0102\3\2\2\2\u0102\u0104\3\2\2\2\u0103\u0105\5\24\13\2\u0104",
    "\u0103\3\2\2\2\u0104\u0105\3\2\2\2\u0105\23\3\2\2\2\u0106\u0107\7\17",
    "\2\2\u0107\u0108\7\20\2\2\u0108\u010d\5\26\f\2\u0109\u010a\7\21\2\2",
    "\u010a\u010c\5\26\f\2\u010b\u0109\3\2\2\2\u010c\u010f\3\2\2\2\u010d",
    "\u010b\3\2\2\2\u010d\u010e\3\2\2\2\u010e\u0110\3\2\2\2\u010f\u010d\3",
    "\2\2\2\u0110\u0111\7\22\2\2\u0111\25\3\2\2\2\u0112\u0113\5\30\r\2\u0113",
    "\u0114\7\23\2\2\u0114\u0116\3\2\2\2\u0115\u0112\3\2\2\2\u0115\u0116",
    "\3\2\2\2\u0116\u0117\3\2\2\2\u0117\u0118\5\u00a0Q\2\u0118\27\3\2\2\2",
    "\u0119\u011a\5\u00a0Q\2\u011a\31\3\2\2\2\u011b\u011c\7\u0089\2\2\u011c",
    "\33\3\2\2\2\u011d\u011e\7\u0089\2\2\u011e\35\3\2\2\2\u011f\u0120\7\u0089",
    "\2\2\u0120\37\3\2\2\2\u0121\u0126\5\"\22\2\u0122\u0126\5&\24\2\u0123",
    "\u0126\5(\25\2\u0124\u0126\5*\26\2\u0125\u0121\3\2\2\2\u0125\u0122\3",
    "\2\2\2\u0125\u0123\3\2\2\2\u0125\u0124\3\2\2\2\u0126!\3\2\2\2\u0127",
    "\u0128\5$\23\2\u0128\u0129\7\23\2\2\u0129\u012b\3\2\2\2\u012a\u0127",
    "\3\2\2\2\u012a\u012b\3\2\2\2\u012b\u012c\3\2\2\2\u012c\u012d\5\u00a0",
    "Q\2\u012d#\3\2\2\2\u012e\u012f\5\u00a0Q\2\u012f%\3\2\2\2\u0130\u0131",
    "\7\24\2\2\u0131\u0132\7\25\2\2\u0132\u0133\5 \21\2\u0133\u0134\7\26",
    "\2\2\u0134\'\3\2\2\2\u0135\u0136\7\27\2\2\u0136\u0137\7\25\2\2\u0137",
    "\u0138\5 \21\2\u0138\u0139\7\26\2\2\u0139)\3\2\2\2\u013a\u013b\7\30",
    "\2\2\u013b\u013c\7\31\2\2\u013c\u0141\5,\27\2\u013d\u013e\7\21\2\2\u013e",
    "\u0140\5,\27\2\u013f\u013d\3\2\2\2\u0140\u0143\3\2\2\2\u0141\u013f\3",
    "\2\2\2\u0141\u0142\3\2\2\2\u0142\u0144\3\2\2\2\u0143\u0141\3\2\2\2\u0144",
    "\u0145\7\32\2\2\u0145+\3\2\2\2\u0146\u0147\5\u00a0Q\2\u0147\u0148\5",
    " \21\2\u0148-\3\2\2\2\u0149\u014d\5\60\31\2\u014a\u014d\5\62\32\2\u014b",
    "\u014d\5\64\33\2\u014c\u0149\3\2\2\2\u014c\u014a\3\2\2\2\u014c\u014b",
    "\3\2\2\2\u014d/\3\2\2\2\u014e\u0150\7\33\2\2\u014f\u0151\5\f\7\2\u0150",
    "\u014f\3\2\2\2\u0150\u0151\3\2\2\2\u0151\u0152\3\2\2\2\u0152\u0153\5",
    "\u00a0Q\2\u0153\u0154\7\r\2\2\u0154\u0155\5f\64\2\u0155\61\3\2\2\2\u0156",
    "\u0157\7\34\2\2\u0157\u0158\5\u00a0Q\2\u0158\63\3\2\2\2\u0159\u015b",
    "\7\33\2\2\u015a\u015c\5\f\7\2\u015b\u015a\3\2\2\2\u015b\u015c\3\2\2",
    "\2\u015c\u015d\3\2\2\2\u015d\u015e\7\35\2\2\u015e\u015f\5\u00a0Q\2\u015f",
    "\u0168\7\20\2\2\u0160\u0165\5\66\34\2\u0161\u0162\7\21\2\2\u0162\u0164",
    "\5\66\34\2\u0163\u0161\3\2\2\2\u0164\u0167\3\2\2\2\u0165\u0163\3\2\2",
    "\2\u0165\u0166\3\2\2\2\u0166\u0169\3\2\2\2\u0167\u0165\3\2\2\2\u0168",
    "\u0160\3\2\2\2\u0168\u0169\3\2\2\2\u0169\u016a\3\2\2\2\u016a\u016b\7",
    "\22\2\2\u016b\u016c\7\r\2\2\u016c\u016d\58\35\2\u016d\65\3\2\2\2\u016e",
    "\u016f\5\u00a0Q\2\u016f\u0170\5 \21\2\u0170\67\3\2\2\2\u0171\u0172\5",
    "f\64\2\u01729\3\2\2\2\u0173\u017a\5F$\2\u0174\u017a\5d\63\2\u0175\u0176",
    "\7\20\2\2\u0176\u0177\5f\64\2\u0177\u0178\7\22\2\2\u0178\u017a\3\2\2",
    "\2\u0179\u0173\3\2\2\2\u0179\u0174\3\2\2\2\u0179\u0175\3\2\2\2\u017a",
    ";\3\2\2\2\u017b\u017c\5:\36\2\u017c\u017d\5> \2\u017d=\3\2\2\2\u017e",
    "\u017f\5\u00a0Q\2\u017f?\3\2\2\2\u0180\u0183\5B\"\2\u0181\u0183\5D#",
    "\2\u0182\u0180\3\2\2\2\u0182\u0181\3\2\2\2\u0183A\3\2\2\2\u0184\u0185",
    "\7\36\2\2\u0185\u0186\5<\37\2\u0186\u0187\7\37\2\2\u0187\u0188\5f\64",
    "\2\u0188C\3\2\2\2\u0189\u018a\7 \2\2\u018a\u018b\5<\37\2\u018b\u018c",
    "\7\37\2\2\u018c\u018d\5f\64\2\u018dE\3\2\2\2\u018e\u018f\7!\2\2\u018f",
    "\u0197\5\"\22\2\u0190\u0194\7\r\2\2\u0191\u0192\5H%\2\u0192\u0193\7",
    "\"\2\2\u0193\u0195\3\2\2\2\u0194\u0191\3\2\2\2\u0194\u0195\3\2\2\2\u0195",
    "\u0196\3\2\2\2\u0196\u0198\5J&\2\u0197\u0190\3\2\2\2\u0197\u0198\3\2",
    "\2\2\u0198\u0199\3\2\2\2\u0199\u019a\7#\2\2\u019aG\3\2\2\2\u019b\u019c",
    "\5\u00a0Q\2\u019cI\3\2\2\2\u019d\u019e\5d\63\2\u019eK\3\2\2\2\u019f",
    "\u01a0\5\u00a0Q\2\u01a0M\3\2\2\2\u01a1\u01a3\5P)\2\u01a2\u01a4\5V,\2",
    "\u01a3\u01a2\3\2\2\2\u01a3\u01a4\3\2\2\2\u01a4\u01a8\3\2\2\2\u01a5\u01a7",
    "\5@!\2\u01a6\u01a5\3\2\2\2\u01a7\u01aa\3\2\2\2\u01a8\u01a6\3\2\2\2\u01a8",
    "\u01a9\3\2\2\2\u01a9\u01ac\3\2\2\2\u01aa\u01a8\3\2\2\2\u01ab\u01ad\5",
    "Z.\2\u01ac\u01ab\3\2\2\2\u01ac\u01ad\3\2\2\2\u01ad\u01af\3\2\2\2\u01ae",
    "\u01b0\5\\/\2\u01af\u01ae\3\2\2\2\u01af\u01b0\3\2\2\2\u01b0\u01b2\3",
    "\2\2\2\u01b1\u01b3\5^\60\2\u01b2\u01b1\3\2\2\2\u01b2\u01b3\3\2\2\2\u01b3",
    "O\3\2\2\2\u01b4\u01b7\5R*\2\u01b5\u01b7\5T+\2\u01b6\u01b4\3\2\2\2\u01b6",
    "\u01b5\3\2\2\2\u01b7Q\3\2\2\2\u01b8\u01b9\5<\37\2\u01b9S\3\2\2\2\u01ba",
    "\u01bb\7$\2\2\u01bb\u01c0\5<\37\2\u01bc\u01bd\7\21\2\2\u01bd\u01bf\5",
    "<\37\2\u01be\u01bc\3\2\2\2\u01bf\u01c2\3\2\2\2\u01c0\u01be\3\2\2\2\u01c0",
    "\u01c1\3\2\2\2\u01c1U\3\2\2\2\u01c2\u01c0\3\2\2\2\u01c3\u01c4\7\33\2",
    "\2\u01c4\u01c9\5X-\2\u01c5\u01c6\7\21\2\2\u01c6\u01c8\5X-\2\u01c7\u01c5",
    "\3\2\2\2\u01c8\u01cb\3\2\2\2\u01c9\u01c7\3\2\2\2\u01c9\u01ca\3\2\2\2",
    "\u01caW\3\2\2\2\u01cb\u01c9\3\2\2\2\u01cc\u01cd\5\u00a0Q\2\u01cd\u01ce",
    "\7\r\2\2\u01ce\u01cf\5f\64\2\u01cfY\3\2\2\2\u01d0\u01d1\7%\2\2\u01d1",
    "\u01d2\5f\64\2\u01d2[\3\2\2\2\u01d3\u01d5\7&\2\2\u01d4\u01d6\t\3\2\2",
    "\u01d5\u01d4\3\2\2\2\u01d5\u01d6\3\2\2\2\u01d6\u01d7\3\2\2\2\u01d7\u01d8",
    "\5f\64\2\u01d8]\3\2\2\2\u01d9\u01e4\7)\2\2\u01da\u01e5\5`\61\2\u01db",
    "\u01dc\7*\2\2\u01dc\u01e1\5b\62\2\u01dd\u01de\7\21\2\2\u01de\u01e0\5",
    "b\62\2\u01df\u01dd\3\2\2\2\u01e0\u01e3\3\2\2\2\u01e1\u01df\3\2\2\2\u01e1",
    "\u01e2\3\2\2\2\u01e2\u01e5\3\2\2\2\u01e3\u01e1\3\2\2\2\u01e4\u01da\3",
    "\2\2\2\u01e4\u01db\3\2\2\2\u01e5_\3\2\2\2\u01e6\u01e7\t\4\2\2\u01e7",
    "a\3\2\2\2\u01e8\u01ea\5n8\2\u01e9\u01eb\5`\61\2\u01ea\u01e9\3\2\2\2",
    "\u01ea\u01eb\3\2\2\2\u01ebc\3\2\2\2\u01ec\u01ed\5L\'\2\u01ed\u01ee\7",
    "\23\2\2\u01ee\u01f0\3\2\2\2\u01ef\u01ec\3\2\2\2\u01f0\u01f3\3\2\2\2",
    "\u01f1\u01ef\3\2\2\2\u01f1\u01f2\3\2\2\2\u01f2\u01f4\3\2\2\2\u01f3\u01f1",
    "\3\2\2\2\u01f4\u01f5\5\u00a0Q\2\u01f5e\3\2\2\2\u01f6\u01f7\b\64\1\2",
    "\u01f7\u01f8\7\60\2\2\u01f8\u0212\5f\64\16\u01f9\u01fa\7\66\2\2\u01fa",
    "\u0212\5f\64\r\u01fb\u0212\5n8\2\u01fc\u0212\5F$\2\u01fd\u0212\5N(\2",
    "\u01fe\u01ff\7\65\2\2\u01ff\u0200\5f\64\2\u0200\u0201\7\64\2\2\u0201",
    "\u0202\5 \21\2\u0202\u0212\3\2\2\2\u0203\u0204\5l\67\2\u0204\u0205\7",
    "8\2\2\u0205\u0206\5n8\2\u0206\u0207\79\2\2\u0207\u0208\5n8\2\u0208\u0212",
    "\3\2\2\2\u0209\u020a\7:\2\2\u020a\u020b\7\"\2\2\u020b\u020c\5l\67\2",
    "\u020c\u020d\78\2\2\u020d\u020e\5n8\2\u020e\u020f\79\2\2\u020f\u0210",
    "\5n8\2\u0210\u0212\3\2\2\2\u0211\u01f6\3\2\2\2\u0211\u01f9\3\2\2\2\u0211",
    "\u01fb\3\2\2\2\u0211\u01fc\3\2\2\2\u0211\u01fd\3\2\2\2\u0211\u01fe\3",
    "\2\2\2\u0211\u0203\3\2\2\2\u0211\u0209\3\2\2\2\u0212\u0240\3\2\2\2\u0213",
    "\u0214\f\t\2\2\u0214\u0215\t\5\2\2\u0215\u023f\5f\64\n\u0216\u0217\f",
    "\b\2\2\u0217\u0218\5z>\2\u0218\u0219\5f\64\t\u0219\u023f\3\2\2\2\u021a",
    "\u021b\f\7\2\2\u021b\u021c\t\6\2\2\u021c\u023f\5f\64\b\u021d\u021e\f",
    "\6\2\2\u021e\u0220\t\7\2\2\u021f\u0221\5r:\2\u0220\u021f\3\2\2\2\u0220",
    "\u0221\3\2\2\2\u0221\u0222\3\2\2\2\u0222\u023f\5f\64\7\u0223\u0224\f",
    "\5\2\2\u0224\u0225\79\2\2\u0225\u023f\5f\64\6\u0226\u0227\f\4\2\2\u0227",
    "\u0228\t\b\2\2\u0228\u023f\5f\64\5\u0229\u022a\f\3\2\2\u022a\u022b\t",
    "\t\2\2\u022b\u023f\5f\64\4\u022c\u022d\f\21\2\2\u022d\u022f\7/\2\2\u022e",
    "\u0230\7\60\2\2\u022f\u022e\3\2\2\2\u022f\u0230\3\2\2\2\u0230\u0231",
    "\3\2\2\2\u0231\u023f\t\n\2\2\u0232\u0233\f\20\2\2\u0233\u0234\t\13\2",
    "\2\u0234\u023f\5 \21\2\u0235\u0237\f\f\2\2\u0236\u0238\7\67\2\2\u0237",
    "\u0236\3\2\2\2\u0237\u0238\3\2\2\2\u0238\u0239\3\2\2\2\u0239\u023a\7",
    "8\2\2\u023a\u023b\5n8\2\u023b\u023c\79\2\2\u023c\u023d\5n8\2\u023d\u023f",
    "\3\2\2\2\u023e\u0213\3\2\2\2\u023e\u0216\3\2\2\2\u023e\u021a\3\2\2\2",
    "\u023e\u021d\3\2\2\2\u023e\u0223\3\2\2\2\u023e\u0226\3\2\2\2\u023e\u0229",
    "\3\2\2\2\u023e\u022c\3\2\2\2\u023e\u0232\3\2\2\2\u023e\u0235\3\2\2\2",
    "\u023f\u0242\3\2\2\2\u0240\u023e\3\2\2\2\u0240\u0241\3\2\2\2\u0241g",
    "\3\2\2\2\u0242\u0240\3\2\2\2\u0243\u0244\t\f\2\2\u0244i\3\2\2\2\u0245",
    "\u024a\5h\65\2\u0246\u024a\7M\2\2\u0247\u024a\7N\2\2\u0248\u024a\7O",
    "\2\2\u0249\u0245\3\2\2\2\u0249\u0246\3\2\2\2\u0249\u0247\3\2\2\2\u0249",
    "\u0248\3\2\2\2\u024ak\3\2\2\2\u024b\u024c\t\r\2\2\u024cm\3\2\2\2\u024d",
    "\u024e\b8\1\2\u024e\u024f\t\16\2\2\u024f\u029b\5n8\21\u0250\u0251\t",
    "\17\2\2\u0251\u0252\7]\2\2\u0252\u029b\5n8\20\u0253\u0254\5j\66\2\u0254",
    "\u0255\7$\2\2\u0255\u0256\5n8\17\u0256\u029b\3\2\2\2\u0257\u0258\7^",
    "\2\2\u0258\u0259\7\"\2\2\u0259\u025a\5l\67\2\u025a\u025b\7]\2\2\u025b",
    "\u025c\5n8\16\u025c\u029b\3\2\2\2\u025d\u025e\7_\2\2\u025e\u025f\7]",
    "\2\2\u025f\u029b\5n8\r\u0260\u0261\7`\2\2\u0261\u0262\7]\2\2\u0262\u029b",
    "\5n8\f\u0263\u0264\7a\2\2\u0264\u0265\7]\2\2\u0265\u029b\5n8\13\u0266",
    "\u0267\7b\2\2\u0267\u0268\7$\2\2\u0268\u029b\5n8\n\u0269\u029b\5|?\2",
    "\u026a\u026b\5L\'\2\u026b\u026c\7\23\2\2\u026c\u026e\3\2\2\2\u026d\u026a",
    "\3\2\2\2\u026d\u026e\3\2\2\2\u026e\u026f\3\2\2\2\u026f\u0270\5\u00a0",
    "Q\2\u0270\u0279\7\20\2\2\u0271\u0276\5f\64\2\u0272\u0273\7\21\2\2\u0273",
    "\u0275\5f\64\2\u0274\u0272\3\2\2\2\u0275\u0278\3\2\2\2\u0276\u0274\3",
    "\2\2\2\u0276\u0277\3\2\2\2\u0277\u027a\3\2\2\2\u0278\u0276\3\2\2\2\u0279",
    "\u0271\3\2\2\2\u0279\u027a\3\2\2\2\u027a\u027b\3\2\2\2\u027b\u027c\7",
    "\22\2\2\u027c\u029b\3\2\2\2\u027d\u027e\7W\2\2\u027e\u027f\5f\64\2\u027f",
    "\u0280\7X\2\2\u0280\u0281\5 \21\2\u0281\u029b\3\2\2\2\u0282\u0283\t",
    "\20\2\2\u0283\u029b\5\"\22\2\u0284\u0285\7j\2\2\u0285\u0286\5f\64\2",
    "\u0286\u0287\7k\2\2\u0287\u0288\5f\64\2\u0288\u0289\7l\2\2\u0289\u028a",
    "\5f\64\2\u028a\u029b\3\2\2\2\u028b\u028d\7m\2\2\u028c\u028e\5f\64\2",
    "\u028d\u028c\3\2\2\2\u028d\u028e\3\2\2\2\u028e\u0290\3\2\2\2\u028f\u0291",
    "\5p9\2\u0290\u028f\3\2\2\2\u0291\u0292\3\2\2\2\u0292\u0290\3\2\2\2\u0292",
    "\u0293\3\2\2\2\u0293\u0294\3\2\2\2\u0294\u0295\7l\2\2\u0295\u0296\5",
    "f\64\2\u0296\u0297\7\\\2\2\u0297\u029b\3\2\2\2\u0298\u0299\t\21\2\2",
    "\u0299\u029b\5f\64\2\u029a\u024d\3\2\2\2\u029a\u0250\3\2\2\2\u029a\u0253",
    "\3\2\2\2\u029a\u0257\3\2\2\2\u029a\u025d\3\2\2\2\u029a\u0260\3\2\2\2",
    "\u029a\u0263\3\2\2\2\u029a\u0266\3\2\2\2\u029a\u0269\3\2\2\2\u029a\u026d",
    "\3\2\2\2\u029a\u027d\3\2\2\2\u029a\u0282\3\2\2\2\u029a\u0284\3\2\2\2",
    "\u029a\u028b\3\2\2\2\u029a\u0298\3\2\2\2\u029b\u02af\3\2\2\2\u029c\u029d",
    "\f\b\2\2\u029d\u029e\7e\2\2\u029e\u02ae\5n8\t\u029f\u02a0\f\7\2\2\u02a0",
    "\u02a1\t\22\2\2\u02a1\u02ae\5n8\b\u02a2\u02a3\f\6\2\2\u02a3\u02a4\t",
    "\16\2\2\u02a4\u02ae\5n8\7\u02a5\u02a6\f\25\2\2\u02a6\u02a7\7\23\2\2",
    "\u02a7\u02ae\5\u00a0Q\2\u02a8\u02a9\f\24\2\2\u02a9\u02aa\7!\2\2\u02aa",
    "\u02ab\5f\64\2\u02ab\u02ac\7#\2\2\u02ac\u02ae\3\2\2\2\u02ad\u029c\3",
    "\2\2\2\u02ad\u029f\3\2\2\2\u02ad\u02a2\3\2\2\2\u02ad\u02a5\3\2\2\2\u02ad",
    "\u02a8\3\2\2\2\u02ae\u02b1\3\2\2\2\u02af\u02ad\3\2\2\2\u02af\u02b0\3",
    "\2\2\2\u02b0o\3\2\2\2\u02b1\u02af\3\2\2\2\u02b2\u02b3\7p\2\2\u02b3\u02b4",
    "\5f\64\2\u02b4\u02b5\7k\2\2\u02b5\u02b6\5f\64\2\u02b6q\3\2\2\2\u02b7",
    "\u02b8\5h\65\2\u02b8\u02b9\7]\2\2\u02b9s\3\2\2\2\u02ba\u02bb\t\23\2",
    "\2\u02bbu\3\2\2\2\u02bc\u02bd\t\24\2\2\u02bdw\3\2\2\2\u02be\u02c0\5",
    "\u009cO\2\u02bf\u02c1\5v<\2\u02c0\u02bf\3\2\2\2\u02c0\u02c1\3\2\2\2",
    "\u02c1y\3\2\2\2\u02c2\u02c4\t\25\2\2\u02c3\u02c2\3\2\2\2\u02c3\u02c4",
    "\3\2\2\2\u02c4\u02c5\3\2\2\2\u02c5\u02c7\7x\2\2\u02c6\u02c8\5h\65\2",
    "\u02c7\u02c6\3\2\2\2\u02c7\u02c8\3\2\2\2\u02c8\u02cb\3\2\2\2\u02c9\u02cc",
    "\5t;\2\u02ca\u02cc\7\64\2\2\u02cb\u02c9\3\2\2\2\u02cb\u02ca\3\2\2\2",
    "\u02cc\u02ce\3\2\2\2\u02cd\u02cf\t\17\2\2\u02ce\u02cd\3\2\2\2\u02ce",
    "\u02cf\3\2\2\2\u02cf\u0314\3\2\2\2\u02d0\u02d2\7\67\2\2\u02d1\u02d0",
    "\3\2\2\2\u02d1\u02d2\3\2\2\2\u02d2\u02d3\3\2\2\2\u02d3\u02d5\7y\2\2",
    "\u02d4\u02d6\5r:\2\u02d5\u02d4\3\2\2\2\u02d5\u02d6\3\2\2\2\u02d6\u02d8",
    "\3\2\2\2\u02d7\u02d9\t\17\2\2\u02d8\u02d7\3\2\2\2\u02d8\u02d9\3\2\2",
    "\2\u02d9\u0314\3\2\2\2\u02da\u02dc\t\25\2\2\u02db\u02da\3\2\2\2\u02db",
    "\u02dc\3\2\2\2\u02dc\u02de\3\2\2\2\u02dd\u02df\7\67\2\2\u02de\u02dd",
    "\3\2\2\2\u02de\u02df\3\2\2\2\u02df\u02e0\3\2\2\2\u02e0\u02e2\t\26\2",
    "\2\u02e1\u02e3\5r:\2\u02e2\u02e1\3\2\2\2\u02e2\u02e3\3\2\2\2\u02e3\u0314",
    "\3\2\2\2\u02e4\u02e6\t\25\2\2\u02e5\u02e4\3\2\2\2\u02e5\u02e6\3\2\2",
    "\2\u02e6\u02e8\3\2\2\2\u02e7\u02e9\5x=\2\u02e8\u02e7\3\2\2\2\u02e8\u02e9",
    "\3\2\2\2\u02e9\u02ea\3\2\2\2\u02ea\u02ec\t\27\2\2\u02eb\u02ed\5r:\2",
    "\u02ec\u02eb\3\2\2\2\u02ec\u02ed\3\2\2\2\u02ed\u02ef\3\2\2\2\u02ee\u02f0",
    "\t\17\2\2\u02ef\u02ee\3\2\2\2\u02ef\u02f0\3\2\2\2\u02f0\u0314\3\2\2",
    "\2\u02f1\u02f3\t\25\2\2\u02f2\u02f1\3\2\2\2\u02f2\u02f3\3\2\2\2\u02f3",
    "\u02f5\3\2\2\2\u02f4\u02f6\7\67\2\2\u02f5\u02f4\3\2\2\2\u02f5\u02f6",
    "\3\2\2\2\u02f6\u02f7\3\2\2\2\u02f7\u02f8\7~\2\2\u02f8\u02f9\5\u009c",
    "O\2\u02f9\u02fb\7]\2\2\u02fa\u02fc\t\17\2\2\u02fb\u02fa\3\2\2\2\u02fb",
    "\u02fc\3\2\2\2\u02fc\u0314\3\2\2\2\u02fd\u02ff\7\177\2\2\u02fe\u0300",
    "\t\27\2\2\u02ff\u02fe\3\2\2\2\u02ff\u0300\3\2\2\2\u0300\u0302\3\2\2",
    "\2\u0301\u0303\5r:\2\u0302\u0301\3\2\2\2\u0302\u0303\3\2\2\2\u0303\u0314",
    "\3\2\2\2\u0304\u0306\7\u0080\2\2\u0305\u0307\t\27\2\2\u0306\u0305\3",
    "\2\2\2\u0306\u0307\3\2\2\2\u0307\u0309\3\2\2\2\u0308\u030a\5r:\2\u0309",
    "\u0308\3\2\2\2\u0309\u030a\3\2\2\2\u030a\u0314\3\2\2\2\u030b\u030d\7",
    "u\2\2\u030c\u030e\5r:\2\u030d\u030c\3\2\2\2\u030d\u030e\3\2\2\2\u030e",
    "\u0314\3\2\2\2\u030f\u0311\7v\2\2\u0310\u0312\5r:\2\u0311\u0310\3\2",
    "\2\2\u0311\u0312\3\2\2\2\u0312\u0314\3\2\2\2\u0313\u02c3\3\2\2\2\u0313",
    "\u02d1\3\2\2\2\u0313\u02db\3\2\2\2\u0313\u02e5\3\2\2\2\u0313\u02f2\3",
    "\2\2\2\u0313\u02fd\3\2\2\2\u0313\u0304\3\2\2\2\u0313\u030b\3\2\2\2\u0313",
    "\u030f\3\2\2\2\u0314{\3\2\2\2\u0315\u0322\5\u00a0Q\2\u0316\u0322\5\u0090",
    "I\2\u0317\u0322\5~@\2\u0318\u0322\5\u0080A\2\u0319\u0322\5\u0084C\2",
    "\u031a\u0322\5\u0088E\2\u031b\u0322\5\u008cG\2\u031c\u0322\5\u008eH",
    "\2\u031d\u031e\7\20\2\2\u031e\u031f\5f\64\2\u031f\u0320\7\22\2\2\u0320",
    "\u0322\3\2\2\2\u0321\u0315\3\2\2\2\u0321\u0316\3\2\2\2\u0321\u0317\3",
    "\2\2\2\u0321\u0318\3\2\2\2\u0321\u0319\3\2\2\2\u0321\u031a\3\2\2\2\u0321",
    "\u031b\3\2\2\2\u0321\u031c\3\2\2\2\u0321\u031d\3\2\2\2\u0322}\3\2\2",
    "\2\u0323\u0324\7\27\2\2\u0324\u0325\t\30\2\2\u0325\u0326\5f\64\2\u0326",
    "\u0327\7\21\2\2\u0327\u0328\5f\64\2\u0328\u0329\t\31\2\2\u0329\177\3",
    "\2\2\2\u032a\u032c\7\30\2\2\u032b\u032a\3\2\2\2\u032b\u032c\3\2\2\2",
    "\u032c\u032d\3\2\2\2\u032d\u0337\7\31\2\2\u032e\u0338\7\r\2\2\u032f",
    "\u0334\5\u0082B\2\u0330\u0331\7\21\2\2\u0331\u0333\5\u0082B\2\u0332",
    "\u0330\3\2\2\2\u0333\u0336\3\2\2\2\u0334\u0332\3\2\2\2\u0334\u0335\3",
    "\2\2\2\u0335\u0338\3\2\2\2\u0336\u0334\3\2\2\2\u0337\u032e\3\2\2\2\u0337",
    "\u032f\3\2\2\2\u0338\u0339\3\2\2\2\u0339\u033a\7\32\2\2\u033a\u0081",
    "\3\2\2\2\u033b\u033c\5\u00a0Q\2\u033c\u033d\7\r\2\2\u033d\u033e\5f\64",
    "\2\u033e\u0083\3\2\2\2\u033f\u0340\5\"\22\2\u0340\u034a\7\31\2\2\u0341",
    "\u034b\7\r\2\2\u0342\u0347\5\u0086D\2\u0343\u0344\7\21\2\2\u0344\u0346",
    "\5\u0086D\2\u0345\u0343\3\2\2\2\u0346\u0349\3\2\2\2\u0347\u0345\3\2",
    "\2\2\u0347\u0348\3\2\2\2\u0348\u034b\3\2\2\2\u0349\u0347\3\2\2\2\u034a",
    "\u0341\3\2\2\2\u034a\u0342\3\2\2\2\u034b\u034c\3\2\2\2\u034c\u034d\7",
    "\32\2\2\u034d\u0085\3\2\2\2\u034e\u034f\5\u00a0Q\2\u034f\u0350\7\r\2",
    "\2\u0350\u0351\5f\64\2\u0351\u0087\3\2\2\2\u0352\u0357\7\24\2\2\u0353",
    "\u0354\7\25\2\2\u0354\u0355\5 \21\2\u0355\u0356\7\26\2\2\u0356\u0358",
    "\3\2\2\2\u0357\u0353\3\2\2\2\u0357\u0358\3\2\2\2\u0358\u035a\3\2\2\2",
    "\u0359\u0352\3\2\2\2\u0359\u035a\3\2\2\2\u035a\u035b\3\2\2\2\u035b\u0364",
    "\7\31\2\2\u035c\u0361\5f\64\2\u035d\u035e\7\21\2\2\u035e\u0360\5f\64",
    "\2\u035f\u035d\3\2\2\2\u0360\u0363\3\2\2\2\u0361\u035f\3\2\2\2\u0361",
    "\u0362\3\2\2\2\u0362\u0365\3\2\2\2\u0363\u0361\3\2\2\2\u0364\u035c\3",
    "\2\2\2\u0364\u0365\3\2\2\2\u0365\u0366\3\2\2\2\u0366\u0367\7\32\2\2",
    "\u0367\u0089\3\2\2\2\u0368\u0369\7\u0081\2\2\u0369\u036a\5\u0096L\2",
    "\u036a\u008b\3\2\2\2\u036b\u036c\7\u0082\2\2\u036c\u036d\5\u0096L\2",
    "\u036d\u036e\7$\2\2\u036e\u0370\5\26\f\2\u036f\u0371\5\u008aF\2\u0370",
    "\u036f\3\2\2\2\u0370\u0371\3\2\2\2\u0371\u008d\3\2\2\2\u0372\u0373\7",
    "\u0083\2\2\u0373\u0374\7\31\2\2\u0374\u0379\5\u008cG\2\u0375\u0376\7",
    "\21\2\2\u0376\u0378\5\u008cG\2\u0377\u0375\3\2\2\2\u0378\u037b\3\2\2",
    "\2\u0379\u0377\3\2\2\2\u0379\u037a\3\2\2\2\u037a\u037c\3\2\2\2\u037b",
    "\u0379\3\2\2\2\u037c\u037e\7\32\2\2\u037d\u037f\5\u008aF\2\u037e\u037d",
    "\3\2\2\2\u037e\u037f\3\2\2\2\u037f\u008f\3\2\2\2\u0380\u0387\5\u0092",
    "J\2\u0381\u0387\5\u0094K\2\u0382\u0387\5\u0096L\2\u0383\u0387\5\u0098",
    "M\2\u0384\u0387\5\u009aN\2\u0385\u0387\5\u009cO\2\u0386\u0380\3\2\2",
    "\2\u0386\u0381\3\2\2\2\u0386\u0382\3\2\2\2\u0386\u0383\3\2\2\2\u0386",
    "\u0384\3\2\2\2\u0386\u0385\3\2\2\2\u0387\u0091\3\2\2\2\u0388\u0389\7",
    "\61\2\2\u0389\u0093\3\2\2\2\u038a\u038b\t\32\2\2\u038b\u0095\3\2\2\2",
    "\u038c\u038d\7\u0089\2\2\u038d\u0097\3\2\2\2\u038e\u038f\7\u0086\2\2",
    "\u038f\u0099\3\2\2\2\u0390\u0391\7\u0087\2\2\u0391\u009b\3\2\2\2\u0392",
    "\u0394\7\u0085\2\2\u0393\u0395\5\u009eP\2\u0394\u0393\3\2\2\2\u0394",
    "\u0395\3\2\2\2\u0395\u009d\3\2\2\2\u0396\u039a\5h\65\2\u0397\u039a\5",
    "l\67\2\u0398\u039a\7\u0089\2\2\u0399\u0396\3\2\2\2\u0399\u0397\3\2\2",
    "\2\u0399\u0398\3\2\2\2\u039a\u009f\3\2\2\2\u039b\u039c\t\33\2\2\u039c",
    "\u00a1\3\2\2\2g\u00a3\u00a8\u00ae\u00b4\u00ba\u00c0\u00c6\u00cc\u00d2",
    "\u00d8\u00e2\u00e7\u00eb\u00ee\u00f6\u00f9\u0101\u0104\u010d\u0115\u0125",
    "\u012a\u0141\u014c\u0150\u015b\u0165\u0168\u0179\u0182\u0194\u0197\u01a3",
    "\u01a8\u01ac\u01af\u01b2\u01b6\u01c0\u01c9\u01d5\u01e1\u01e4\u01ea\u01f1",
    "\u0211\u0220\u022f\u0237\u023e\u0240\u0249\u026d\u0276\u0279\u028d\u0292",
    "\u029a\u02ad\u02af\u02c0\u02c3\u02c7\u02cb\u02ce\u02d1\u02d5\u02d8\u02db",
    "\u02de\u02e2\u02e5\u02e8\u02ec\u02ef\u02f2\u02f5\u02fb\u02ff\u0302\u0306",
    "\u0309\u030d\u0311\u0313\u0321\u032b\u0334\u0337\u0347\u034a\u0357\u0359",
    "\u0361\u0364\u0370\u0379\u037e\u0386\u0394\u0399"].join("");


var atn = new antlr4.atn.ATNDeserializer().deserialize(serializedATN);

var decisionsToDFA = atn.decisionToState.map( function(ds, index) { return new antlr4.dfa.DFA(ds, index); });

var sharedContextCache = new antlr4.PredictionContextCache();

var literalNames = [ 'null', "'library'", "'version'", "'using'", "'include'", 
                     "'called'", "'public'", "'private'", "'parameter'", 
                     "'default'", "'codesystem'", "':'", "'valueset'", "'codesystems'", 
                     "'('", "','", "')'", "'.'", "'List'", "'<'", "'>'", 
                     "'Interval'", "'Tuple'", "'{'", "'}'", "'define'", 
                     "'context'", "'function'", "'with'", "'such that'", 
                     "'without'", "'['", "'in'", "']'", "'from'", "'where'", 
                     "'return'", "'all'", "'distinct'", "'sort'", "'by'", 
                     "'asc'", "'ascending'", "'desc'", "'descending'", "'is'", 
                     "'not'", "'null'", "'true'", "'false'", "'as'", "'cast'", 
                     "'exists'", "'properly'", "'between'", "'and'", "'difference'", 
                     "'<='", "'>='", "'='", "'<>'", "'matches'", "'contains'", 
                     "'or'", "'xor'", "'union'", "'intersect'", "'except'", 
                     "'year'", "'month'", "'day'", "'hour'", "'minute'", 
                     "'second'", "'millisecond'", "'date'", "'time'", "'timezone'", 
                     "'years'", "'months'", "'days'", "'hours'", "'minutes'", 
                     "'seconds'", "'milliseconds'", "'convert'", "'to'", 
                     "'+'", "'-'", "'start'", "'end'", "'of'", "'duration'", 
                     "'width'", "'successor'", "'predecessor'", "'singleton'", 
                     "'minimum'", "'maximum'", "'^'", "'*'", "'/'", "'div'", 
                     "'mod'", "'if'", "'then'", "'else'", "'case'", "'collapse'", 
                     "'expand'", "'when'", "'or before'", "'or after'", 
                     "'or more'", "'or less'", "'starts'", "'ends'", "'occurs'", 
                     "'same'", "'includes'", "'during'", "'included in'", 
                     "'before'", "'after'", "'within'", "'meets'", "'overlaps'", 
                     "'display'", "'Code'", "'Concept'" ];

var symbolicNames = [ 'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', 'null', 'null', 'null', 
                      'null', 'null', 'null', 'null', "IDENTIFIER", "QUANTITY", 
                      "DATETIME", "TIME", "QUOTEDIDENTIFIER", "STRING", 
                      "WS", "NEWLINE", "COMMENT", "LINE_COMMENT" ];

var ruleNames =  [ "logic", "libraryDefinition", "usingDefinition", "includeDefinition", 
                   "localIdentifier", "accessModifier", "parameterDefinition", 
                   "codesystemDefinition", "valuesetDefinition", "codesystems", 
                   "codesystemIdentifier", "libraryIdentifier", "codesystemId", 
                   "valuesetId", "versionSpecifier", "typeSpecifier", "namedTypeSpecifier", 
                   "modelIdentifier", "listTypeSpecifier", "intervalTypeSpecifier", 
                   "tupleTypeSpecifier", "tupleElementDefinition", "statement", 
                   "expressionDefinition", "contextDefinition", "functionDefinition", 
                   "operandDefinition", "functionBody", "querySource", "aliasedQuerySource", 
                   "alias", "queryInclusionClause", "withClause", "withoutClause", 
                   "retrieve", "valuesetPathIdentifier", "valueset", "qualifier", 
                   "query", "sourceClause", "singleSourceClause", "multipleSourceClause", 
                   "defineClause", "defineClauseItem", "whereClause", "returnClause", 
                   "sortClause", "sortDirection", "sortByItem", "qualifiedIdentifier", 
                   "expression", "dateTimePrecision", "dateTimeComponent", 
                   "pluralDateTimePrecision", "expressionTerm", "caseExpressionItem", 
                   "dateTimePrecisionSpecifier", "relativeQualifier", "offsetRelativeQualifier", 
                   "quantityOffset", "intervalOperatorPhrase", "term", "intervalSelector", 
                   "tupleSelector", "tupleElementSelector", "instanceSelector", 
                   "instanceElementSelector", "listSelector", "displayClause", 
                   "codeSelector", "conceptSelector", "literal", "nullLiteral", 
                   "booleanLiteral", "stringLiteral", "dateTimeLiteral", 
                   "timeLiteral", "quantityLiteral", "unit", "identifier" ];

function cqlParser (input) {
	antlr4.Parser.call(this, input);
    this._interp = new antlr4.atn.ParserATNSimulator(this, atn, decisionsToDFA, sharedContextCache);
    this.ruleNames = ruleNames;
    this.literalNames = literalNames;
    this.symbolicNames = symbolicNames;
    return this;
}

cqlParser.prototype = Object.create(antlr4.Parser.prototype);
cqlParser.prototype.constructor = cqlParser;

Object.defineProperty(cqlParser.prototype, "atn", {
	get : function() {
		return atn;
	}
});

cqlParser.EOF = antlr4.Token.EOF;
cqlParser.T__0 = 1;
cqlParser.T__1 = 2;
cqlParser.T__2 = 3;
cqlParser.T__3 = 4;
cqlParser.T__4 = 5;
cqlParser.T__5 = 6;
cqlParser.T__6 = 7;
cqlParser.T__7 = 8;
cqlParser.T__8 = 9;
cqlParser.T__9 = 10;
cqlParser.T__10 = 11;
cqlParser.T__11 = 12;
cqlParser.T__12 = 13;
cqlParser.T__13 = 14;
cqlParser.T__14 = 15;
cqlParser.T__15 = 16;
cqlParser.T__16 = 17;
cqlParser.T__17 = 18;
cqlParser.T__18 = 19;
cqlParser.T__19 = 20;
cqlParser.T__20 = 21;
cqlParser.T__21 = 22;
cqlParser.T__22 = 23;
cqlParser.T__23 = 24;
cqlParser.T__24 = 25;
cqlParser.T__25 = 26;
cqlParser.T__26 = 27;
cqlParser.T__27 = 28;
cqlParser.T__28 = 29;
cqlParser.T__29 = 30;
cqlParser.T__30 = 31;
cqlParser.T__31 = 32;
cqlParser.T__32 = 33;
cqlParser.T__33 = 34;
cqlParser.T__34 = 35;
cqlParser.T__35 = 36;
cqlParser.T__36 = 37;
cqlParser.T__37 = 38;
cqlParser.T__38 = 39;
cqlParser.T__39 = 40;
cqlParser.T__40 = 41;
cqlParser.T__41 = 42;
cqlParser.T__42 = 43;
cqlParser.T__43 = 44;
cqlParser.T__44 = 45;
cqlParser.T__45 = 46;
cqlParser.T__46 = 47;
cqlParser.T__47 = 48;
cqlParser.T__48 = 49;
cqlParser.T__49 = 50;
cqlParser.T__50 = 51;
cqlParser.T__51 = 52;
cqlParser.T__52 = 53;
cqlParser.T__53 = 54;
cqlParser.T__54 = 55;
cqlParser.T__55 = 56;
cqlParser.T__56 = 57;
cqlParser.T__57 = 58;
cqlParser.T__58 = 59;
cqlParser.T__59 = 60;
cqlParser.T__60 = 61;
cqlParser.T__61 = 62;
cqlParser.T__62 = 63;
cqlParser.T__63 = 64;
cqlParser.T__64 = 65;
cqlParser.T__65 = 66;
cqlParser.T__66 = 67;
cqlParser.T__67 = 68;
cqlParser.T__68 = 69;
cqlParser.T__69 = 70;
cqlParser.T__70 = 71;
cqlParser.T__71 = 72;
cqlParser.T__72 = 73;
cqlParser.T__73 = 74;
cqlParser.T__74 = 75;
cqlParser.T__75 = 76;
cqlParser.T__76 = 77;
cqlParser.T__77 = 78;
cqlParser.T__78 = 79;
cqlParser.T__79 = 80;
cqlParser.T__80 = 81;
cqlParser.T__81 = 82;
cqlParser.T__82 = 83;
cqlParser.T__83 = 84;
cqlParser.T__84 = 85;
cqlParser.T__85 = 86;
cqlParser.T__86 = 87;
cqlParser.T__87 = 88;
cqlParser.T__88 = 89;
cqlParser.T__89 = 90;
cqlParser.T__90 = 91;
cqlParser.T__91 = 92;
cqlParser.T__92 = 93;
cqlParser.T__93 = 94;
cqlParser.T__94 = 95;
cqlParser.T__95 = 96;
cqlParser.T__96 = 97;
cqlParser.T__97 = 98;
cqlParser.T__98 = 99;
cqlParser.T__99 = 100;
cqlParser.T__100 = 101;
cqlParser.T__101 = 102;
cqlParser.T__102 = 103;
cqlParser.T__103 = 104;
cqlParser.T__104 = 105;
cqlParser.T__105 = 106;
cqlParser.T__106 = 107;
cqlParser.T__107 = 108;
cqlParser.T__108 = 109;
cqlParser.T__109 = 110;
cqlParser.T__110 = 111;
cqlParser.T__111 = 112;
cqlParser.T__112 = 113;
cqlParser.T__113 = 114;
cqlParser.T__114 = 115;
cqlParser.T__115 = 116;
cqlParser.T__116 = 117;
cqlParser.T__117 = 118;
cqlParser.T__118 = 119;
cqlParser.T__119 = 120;
cqlParser.T__120 = 121;
cqlParser.T__121 = 122;
cqlParser.T__122 = 123;
cqlParser.T__123 = 124;
cqlParser.T__124 = 125;
cqlParser.T__125 = 126;
cqlParser.T__126 = 127;
cqlParser.T__127 = 128;
cqlParser.T__128 = 129;
cqlParser.IDENTIFIER = 130;
cqlParser.QUANTITY = 131;
cqlParser.DATETIME = 132;
cqlParser.TIME = 133;
cqlParser.QUOTEDIDENTIFIER = 134;
cqlParser.STRING = 135;
cqlParser.WS = 136;
cqlParser.NEWLINE = 137;
cqlParser.COMMENT = 138;
cqlParser.LINE_COMMENT = 139;

cqlParser.RULE_logic = 0;
cqlParser.RULE_libraryDefinition = 1;
cqlParser.RULE_usingDefinition = 2;
cqlParser.RULE_includeDefinition = 3;
cqlParser.RULE_localIdentifier = 4;
cqlParser.RULE_accessModifier = 5;
cqlParser.RULE_parameterDefinition = 6;
cqlParser.RULE_codesystemDefinition = 7;
cqlParser.RULE_valuesetDefinition = 8;
cqlParser.RULE_codesystems = 9;
cqlParser.RULE_codesystemIdentifier = 10;
cqlParser.RULE_libraryIdentifier = 11;
cqlParser.RULE_codesystemId = 12;
cqlParser.RULE_valuesetId = 13;
cqlParser.RULE_versionSpecifier = 14;
cqlParser.RULE_typeSpecifier = 15;
cqlParser.RULE_namedTypeSpecifier = 16;
cqlParser.RULE_modelIdentifier = 17;
cqlParser.RULE_listTypeSpecifier = 18;
cqlParser.RULE_intervalTypeSpecifier = 19;
cqlParser.RULE_tupleTypeSpecifier = 20;
cqlParser.RULE_tupleElementDefinition = 21;
cqlParser.RULE_statement = 22;
cqlParser.RULE_expressionDefinition = 23;
cqlParser.RULE_contextDefinition = 24;
cqlParser.RULE_functionDefinition = 25;
cqlParser.RULE_operandDefinition = 26;
cqlParser.RULE_functionBody = 27;
cqlParser.RULE_querySource = 28;
cqlParser.RULE_aliasedQuerySource = 29;
cqlParser.RULE_alias = 30;
cqlParser.RULE_queryInclusionClause = 31;
cqlParser.RULE_withClause = 32;
cqlParser.RULE_withoutClause = 33;
cqlParser.RULE_retrieve = 34;
cqlParser.RULE_valuesetPathIdentifier = 35;
cqlParser.RULE_valueset = 36;
cqlParser.RULE_qualifier = 37;
cqlParser.RULE_query = 38;
cqlParser.RULE_sourceClause = 39;
cqlParser.RULE_singleSourceClause = 40;
cqlParser.RULE_multipleSourceClause = 41;
cqlParser.RULE_defineClause = 42;
cqlParser.RULE_defineClauseItem = 43;
cqlParser.RULE_whereClause = 44;
cqlParser.RULE_returnClause = 45;
cqlParser.RULE_sortClause = 46;
cqlParser.RULE_sortDirection = 47;
cqlParser.RULE_sortByItem = 48;
cqlParser.RULE_qualifiedIdentifier = 49;
cqlParser.RULE_expression = 50;
cqlParser.RULE_dateTimePrecision = 51;
cqlParser.RULE_dateTimeComponent = 52;
cqlParser.RULE_pluralDateTimePrecision = 53;
cqlParser.RULE_expressionTerm = 54;
cqlParser.RULE_caseExpressionItem = 55;
cqlParser.RULE_dateTimePrecisionSpecifier = 56;
cqlParser.RULE_relativeQualifier = 57;
cqlParser.RULE_offsetRelativeQualifier = 58;
cqlParser.RULE_quantityOffset = 59;
cqlParser.RULE_intervalOperatorPhrase = 60;
cqlParser.RULE_term = 61;
cqlParser.RULE_intervalSelector = 62;
cqlParser.RULE_tupleSelector = 63;
cqlParser.RULE_tupleElementSelector = 64;
cqlParser.RULE_instanceSelector = 65;
cqlParser.RULE_instanceElementSelector = 66;
cqlParser.RULE_listSelector = 67;
cqlParser.RULE_displayClause = 68;
cqlParser.RULE_codeSelector = 69;
cqlParser.RULE_conceptSelector = 70;
cqlParser.RULE_literal = 71;
cqlParser.RULE_nullLiteral = 72;
cqlParser.RULE_booleanLiteral = 73;
cqlParser.RULE_stringLiteral = 74;
cqlParser.RULE_dateTimeLiteral = 75;
cqlParser.RULE_timeLiteral = 76;
cqlParser.RULE_quantityLiteral = 77;
cqlParser.RULE_unit = 78;
cqlParser.RULE_identifier = 79;

function LogicContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_logic;
    return this;
}

LogicContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
LogicContext.prototype.constructor = LogicContext;

LogicContext.prototype.libraryDefinition = function() {
    return this.getTypedRuleContext(LibraryDefinitionContext,0);
};

LogicContext.prototype.usingDefinition = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(UsingDefinitionContext);
    } else {
        return this.getTypedRuleContext(UsingDefinitionContext,i);
    }
};

LogicContext.prototype.includeDefinition = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(IncludeDefinitionContext);
    } else {
        return this.getTypedRuleContext(IncludeDefinitionContext,i);
    }
};

LogicContext.prototype.codesystemDefinition = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(CodesystemDefinitionContext);
    } else {
        return this.getTypedRuleContext(CodesystemDefinitionContext,i);
    }
};

LogicContext.prototype.valuesetDefinition = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ValuesetDefinitionContext);
    } else {
        return this.getTypedRuleContext(ValuesetDefinitionContext,i);
    }
};

LogicContext.prototype.parameterDefinition = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ParameterDefinitionContext);
    } else {
        return this.getTypedRuleContext(ParameterDefinitionContext,i);
    }
};

LogicContext.prototype.statement = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(StatementContext);
    } else {
        return this.getTypedRuleContext(StatementContext,i);
    }
};

LogicContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterLogic(this);
	}
};

LogicContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitLogic(this);
	}
};




cqlParser.LogicContext = LogicContext;

cqlParser.prototype.logic = function() {

    var localctx = new LogicContext(this, this._ctx, this.state);
    this.enterRule(localctx, 0, cqlParser.RULE_logic);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 161;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__0) {
            this.state = 160;
            this.libraryDefinition();
        }

        this.state = 166;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while(_la===cqlParser.T__2) {
            this.state = 163;
            this.usingDefinition();
            this.state = 168;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
        }
        this.state = 172;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while(_la===cqlParser.T__3) {
            this.state = 169;
            this.includeDefinition();
            this.state = 174;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
        }
        this.state = 178;
        this._errHandler.sync(this);
        var _alt = this._interp.adaptivePredict(this._input,3,this._ctx)
        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
            if(_alt===1) {
                this.state = 175;
                this.codesystemDefinition(); 
            }
            this.state = 180;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input,3,this._ctx);
        }

        this.state = 184;
        this._errHandler.sync(this);
        var _alt = this._interp.adaptivePredict(this._input,4,this._ctx)
        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
            if(_alt===1) {
                this.state = 181;
                this.valuesetDefinition(); 
            }
            this.state = 186;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input,4,this._ctx);
        }

        this.state = 190;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while((((_la) & ~0x1f) == 0 && ((1 << _la) & ((1 << cqlParser.T__5) | (1 << cqlParser.T__6) | (1 << cqlParser.T__7))) !== 0)) {
            this.state = 187;
            this.parameterDefinition();
            this.state = 192;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
        }
        this.state = 194; 
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        do {
            this.state = 193;
            this.statement();
            this.state = 196; 
            this._errHandler.sync(this);
            _la = this._input.LA(1);
        } while(_la===cqlParser.T__24 || _la===cqlParser.T__25);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function LibraryDefinitionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_libraryDefinition;
    return this;
}

LibraryDefinitionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
LibraryDefinitionContext.prototype.constructor = LibraryDefinitionContext;

LibraryDefinitionContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

LibraryDefinitionContext.prototype.versionSpecifier = function() {
    return this.getTypedRuleContext(VersionSpecifierContext,0);
};

LibraryDefinitionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterLibraryDefinition(this);
	}
};

LibraryDefinitionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitLibraryDefinition(this);
	}
};




cqlParser.LibraryDefinitionContext = LibraryDefinitionContext;

cqlParser.prototype.libraryDefinition = function() {

    var localctx = new LibraryDefinitionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 2, cqlParser.RULE_libraryDefinition);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 198;
        this.match(cqlParser.T__0);
        this.state = 199;
        this.identifier();
        this.state = 202;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__1) {
            this.state = 200;
            this.match(cqlParser.T__1);
            this.state = 201;
            this.versionSpecifier();
        }

    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function UsingDefinitionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_usingDefinition;
    return this;
}

UsingDefinitionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
UsingDefinitionContext.prototype.constructor = UsingDefinitionContext;

UsingDefinitionContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

UsingDefinitionContext.prototype.versionSpecifier = function() {
    return this.getTypedRuleContext(VersionSpecifierContext,0);
};

UsingDefinitionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterUsingDefinition(this);
	}
};

UsingDefinitionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitUsingDefinition(this);
	}
};




cqlParser.UsingDefinitionContext = UsingDefinitionContext;

cqlParser.prototype.usingDefinition = function() {

    var localctx = new UsingDefinitionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 4, cqlParser.RULE_usingDefinition);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 204;
        this.match(cqlParser.T__2);
        this.state = 205;
        this.identifier();
        this.state = 208;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__1) {
            this.state = 206;
            this.match(cqlParser.T__1);
            this.state = 207;
            this.versionSpecifier();
        }

    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function IncludeDefinitionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_includeDefinition;
    return this;
}

IncludeDefinitionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
IncludeDefinitionContext.prototype.constructor = IncludeDefinitionContext;

IncludeDefinitionContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

IncludeDefinitionContext.prototype.localIdentifier = function() {
    return this.getTypedRuleContext(LocalIdentifierContext,0);
};

IncludeDefinitionContext.prototype.versionSpecifier = function() {
    return this.getTypedRuleContext(VersionSpecifierContext,0);
};

IncludeDefinitionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterIncludeDefinition(this);
	}
};

IncludeDefinitionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitIncludeDefinition(this);
	}
};




cqlParser.IncludeDefinitionContext = IncludeDefinitionContext;

cqlParser.prototype.includeDefinition = function() {

    var localctx = new IncludeDefinitionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 6, cqlParser.RULE_includeDefinition);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 210;
        this.match(cqlParser.T__3);
        this.state = 211;
        this.identifier();
        this.state = 214;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__1) {
            this.state = 212;
            this.match(cqlParser.T__1);
            this.state = 213;
            this.versionSpecifier();
        }

        this.state = 216;
        this.match(cqlParser.T__4);
        this.state = 217;
        this.localIdentifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function LocalIdentifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_localIdentifier;
    return this;
}

LocalIdentifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
LocalIdentifierContext.prototype.constructor = LocalIdentifierContext;

LocalIdentifierContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

LocalIdentifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterLocalIdentifier(this);
	}
};

LocalIdentifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitLocalIdentifier(this);
	}
};




cqlParser.LocalIdentifierContext = LocalIdentifierContext;

cqlParser.prototype.localIdentifier = function() {

    var localctx = new LocalIdentifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 8, cqlParser.RULE_localIdentifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 219;
        this.identifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function AccessModifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_accessModifier;
    return this;
}

AccessModifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
AccessModifierContext.prototype.constructor = AccessModifierContext;


AccessModifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterAccessModifier(this);
	}
};

AccessModifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitAccessModifier(this);
	}
};




cqlParser.AccessModifierContext = AccessModifierContext;

cqlParser.prototype.accessModifier = function() {

    var localctx = new AccessModifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 10, cqlParser.RULE_accessModifier);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 221;
        _la = this._input.LA(1);
        if(!(_la===cqlParser.T__5 || _la===cqlParser.T__6)) {
        this._errHandler.recoverInline(this);
        }
        else {
            this.consume();
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ParameterDefinitionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_parameterDefinition;
    return this;
}

ParameterDefinitionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ParameterDefinitionContext.prototype.constructor = ParameterDefinitionContext;

ParameterDefinitionContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

ParameterDefinitionContext.prototype.accessModifier = function() {
    return this.getTypedRuleContext(AccessModifierContext,0);
};

ParameterDefinitionContext.prototype.typeSpecifier = function() {
    return this.getTypedRuleContext(TypeSpecifierContext,0);
};

ParameterDefinitionContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

ParameterDefinitionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterParameterDefinition(this);
	}
};

ParameterDefinitionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitParameterDefinition(this);
	}
};




cqlParser.ParameterDefinitionContext = ParameterDefinitionContext;

cqlParser.prototype.parameterDefinition = function() {

    var localctx = new ParameterDefinitionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 12, cqlParser.RULE_parameterDefinition);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 224;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__5 || _la===cqlParser.T__6) {
            this.state = 223;
            this.accessModifier();
        }

        this.state = 226;
        this.match(cqlParser.T__7);
        this.state = 227;
        this.identifier();
        this.state = 229;
        _la = this._input.LA(1);
        if((((_la) & ~0x1f) == 0 && ((1 << _la) & ((1 << cqlParser.T__1) | (1 << cqlParser.T__17) | (1 << cqlParser.T__20) | (1 << cqlParser.T__21))) !== 0) || ((((_la - 75)) & ~0x1f) == 0 && ((1 << (_la - 75)) & ((1 << (cqlParser.T__74 - 75)) | (1 << (cqlParser.T__75 - 75)) | (1 << (cqlParser.T__76 - 75)))) !== 0) || ((((_la - 127)) & ~0x1f) == 0 && ((1 << (_la - 127)) & ((1 << (cqlParser.T__126 - 127)) | (1 << (cqlParser.T__127 - 127)) | (1 << (cqlParser.T__128 - 127)) | (1 << (cqlParser.IDENTIFIER - 127)) | (1 << (cqlParser.QUOTEDIDENTIFIER - 127)))) !== 0)) {
            this.state = 228;
            this.typeSpecifier();
        }

        this.state = 233;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__8) {
            this.state = 231;
            this.match(cqlParser.T__8);
            this.state = 232;
            this.expression(0);
        }

    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function CodesystemDefinitionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_codesystemDefinition;
    return this;
}

CodesystemDefinitionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
CodesystemDefinitionContext.prototype.constructor = CodesystemDefinitionContext;

CodesystemDefinitionContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

CodesystemDefinitionContext.prototype.codesystemId = function() {
    return this.getTypedRuleContext(CodesystemIdContext,0);
};

CodesystemDefinitionContext.prototype.accessModifier = function() {
    return this.getTypedRuleContext(AccessModifierContext,0);
};

CodesystemDefinitionContext.prototype.versionSpecifier = function() {
    return this.getTypedRuleContext(VersionSpecifierContext,0);
};

CodesystemDefinitionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterCodesystemDefinition(this);
	}
};

CodesystemDefinitionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitCodesystemDefinition(this);
	}
};




cqlParser.CodesystemDefinitionContext = CodesystemDefinitionContext;

cqlParser.prototype.codesystemDefinition = function() {

    var localctx = new CodesystemDefinitionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 14, cqlParser.RULE_codesystemDefinition);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 236;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__5 || _la===cqlParser.T__6) {
            this.state = 235;
            this.accessModifier();
        }

        this.state = 238;
        this.match(cqlParser.T__9);
        this.state = 239;
        this.identifier();
        this.state = 240;
        this.match(cqlParser.T__10);
        this.state = 241;
        this.codesystemId();
        this.state = 244;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__1) {
            this.state = 242;
            this.match(cqlParser.T__1);
            this.state = 243;
            this.versionSpecifier();
        }

    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ValuesetDefinitionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_valuesetDefinition;
    return this;
}

ValuesetDefinitionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ValuesetDefinitionContext.prototype.constructor = ValuesetDefinitionContext;

ValuesetDefinitionContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

ValuesetDefinitionContext.prototype.valuesetId = function() {
    return this.getTypedRuleContext(ValuesetIdContext,0);
};

ValuesetDefinitionContext.prototype.accessModifier = function() {
    return this.getTypedRuleContext(AccessModifierContext,0);
};

ValuesetDefinitionContext.prototype.versionSpecifier = function() {
    return this.getTypedRuleContext(VersionSpecifierContext,0);
};

ValuesetDefinitionContext.prototype.codesystems = function() {
    return this.getTypedRuleContext(CodesystemsContext,0);
};

ValuesetDefinitionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterValuesetDefinition(this);
	}
};

ValuesetDefinitionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitValuesetDefinition(this);
	}
};




cqlParser.ValuesetDefinitionContext = ValuesetDefinitionContext;

cqlParser.prototype.valuesetDefinition = function() {

    var localctx = new ValuesetDefinitionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 16, cqlParser.RULE_valuesetDefinition);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 247;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__5 || _la===cqlParser.T__6) {
            this.state = 246;
            this.accessModifier();
        }

        this.state = 249;
        this.match(cqlParser.T__11);
        this.state = 250;
        this.identifier();
        this.state = 251;
        this.match(cqlParser.T__10);
        this.state = 252;
        this.valuesetId();
        this.state = 255;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__1) {
            this.state = 253;
            this.match(cqlParser.T__1);
            this.state = 254;
            this.versionSpecifier();
        }

        this.state = 258;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__12) {
            this.state = 257;
            this.codesystems();
        }

    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function CodesystemsContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_codesystems;
    return this;
}

CodesystemsContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
CodesystemsContext.prototype.constructor = CodesystemsContext;

CodesystemsContext.prototype.codesystemIdentifier = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(CodesystemIdentifierContext);
    } else {
        return this.getTypedRuleContext(CodesystemIdentifierContext,i);
    }
};

CodesystemsContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterCodesystems(this);
	}
};

CodesystemsContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitCodesystems(this);
	}
};




cqlParser.CodesystemsContext = CodesystemsContext;

cqlParser.prototype.codesystems = function() {

    var localctx = new CodesystemsContext(this, this._ctx, this.state);
    this.enterRule(localctx, 18, cqlParser.RULE_codesystems);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 260;
        this.match(cqlParser.T__12);
        this.state = 261;
        this.match(cqlParser.T__13);
        this.state = 262;
        this.codesystemIdentifier();
        this.state = 267;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while(_la===cqlParser.T__14) {
            this.state = 263;
            this.match(cqlParser.T__14);
            this.state = 264;
            this.codesystemIdentifier();
            this.state = 269;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
        }
        this.state = 270;
        this.match(cqlParser.T__15);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function CodesystemIdentifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_codesystemIdentifier;
    return this;
}

CodesystemIdentifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
CodesystemIdentifierContext.prototype.constructor = CodesystemIdentifierContext;

CodesystemIdentifierContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

CodesystemIdentifierContext.prototype.libraryIdentifier = function() {
    return this.getTypedRuleContext(LibraryIdentifierContext,0);
};

CodesystemIdentifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterCodesystemIdentifier(this);
	}
};

CodesystemIdentifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitCodesystemIdentifier(this);
	}
};




cqlParser.CodesystemIdentifierContext = CodesystemIdentifierContext;

cqlParser.prototype.codesystemIdentifier = function() {

    var localctx = new CodesystemIdentifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 20, cqlParser.RULE_codesystemIdentifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 275;
        var la_ = this._interp.adaptivePredict(this._input,19,this._ctx);
        if(la_===1) {
            this.state = 272;
            this.libraryIdentifier();
            this.state = 273;
            this.match(cqlParser.T__16);

        }
        this.state = 277;
        this.identifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function LibraryIdentifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_libraryIdentifier;
    return this;
}

LibraryIdentifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
LibraryIdentifierContext.prototype.constructor = LibraryIdentifierContext;

LibraryIdentifierContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

LibraryIdentifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterLibraryIdentifier(this);
	}
};

LibraryIdentifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitLibraryIdentifier(this);
	}
};




cqlParser.LibraryIdentifierContext = LibraryIdentifierContext;

cqlParser.prototype.libraryIdentifier = function() {

    var localctx = new LibraryIdentifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 22, cqlParser.RULE_libraryIdentifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 279;
        this.identifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function CodesystemIdContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_codesystemId;
    return this;
}

CodesystemIdContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
CodesystemIdContext.prototype.constructor = CodesystemIdContext;

CodesystemIdContext.prototype.STRING = function() {
    return this.getToken(cqlParser.STRING, 0);
};

CodesystemIdContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterCodesystemId(this);
	}
};

CodesystemIdContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitCodesystemId(this);
	}
};




cqlParser.CodesystemIdContext = CodesystemIdContext;

cqlParser.prototype.codesystemId = function() {

    var localctx = new CodesystemIdContext(this, this._ctx, this.state);
    this.enterRule(localctx, 24, cqlParser.RULE_codesystemId);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 281;
        this.match(cqlParser.STRING);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ValuesetIdContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_valuesetId;
    return this;
}

ValuesetIdContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ValuesetIdContext.prototype.constructor = ValuesetIdContext;

ValuesetIdContext.prototype.STRING = function() {
    return this.getToken(cqlParser.STRING, 0);
};

ValuesetIdContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterValuesetId(this);
	}
};

ValuesetIdContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitValuesetId(this);
	}
};




cqlParser.ValuesetIdContext = ValuesetIdContext;

cqlParser.prototype.valuesetId = function() {

    var localctx = new ValuesetIdContext(this, this._ctx, this.state);
    this.enterRule(localctx, 26, cqlParser.RULE_valuesetId);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 283;
        this.match(cqlParser.STRING);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function VersionSpecifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_versionSpecifier;
    return this;
}

VersionSpecifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
VersionSpecifierContext.prototype.constructor = VersionSpecifierContext;

VersionSpecifierContext.prototype.STRING = function() {
    return this.getToken(cqlParser.STRING, 0);
};

VersionSpecifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterVersionSpecifier(this);
	}
};

VersionSpecifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitVersionSpecifier(this);
	}
};




cqlParser.VersionSpecifierContext = VersionSpecifierContext;

cqlParser.prototype.versionSpecifier = function() {

    var localctx = new VersionSpecifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 28, cqlParser.RULE_versionSpecifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 285;
        this.match(cqlParser.STRING);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function TypeSpecifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_typeSpecifier;
    return this;
}

TypeSpecifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
TypeSpecifierContext.prototype.constructor = TypeSpecifierContext;

TypeSpecifierContext.prototype.namedTypeSpecifier = function() {
    return this.getTypedRuleContext(NamedTypeSpecifierContext,0);
};

TypeSpecifierContext.prototype.listTypeSpecifier = function() {
    return this.getTypedRuleContext(ListTypeSpecifierContext,0);
};

TypeSpecifierContext.prototype.intervalTypeSpecifier = function() {
    return this.getTypedRuleContext(IntervalTypeSpecifierContext,0);
};

TypeSpecifierContext.prototype.tupleTypeSpecifier = function() {
    return this.getTypedRuleContext(TupleTypeSpecifierContext,0);
};

TypeSpecifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTypeSpecifier(this);
	}
};

TypeSpecifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTypeSpecifier(this);
	}
};




cqlParser.TypeSpecifierContext = TypeSpecifierContext;

cqlParser.prototype.typeSpecifier = function() {

    var localctx = new TypeSpecifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 30, cqlParser.RULE_typeSpecifier);
    try {
        this.state = 291;
        switch(this._input.LA(1)) {
        case cqlParser.T__1:
        case cqlParser.T__74:
        case cqlParser.T__75:
        case cqlParser.T__76:
        case cqlParser.T__126:
        case cqlParser.T__127:
        case cqlParser.T__128:
        case cqlParser.IDENTIFIER:
        case cqlParser.QUOTEDIDENTIFIER:
            this.enterOuterAlt(localctx, 1);
            this.state = 287;
            this.namedTypeSpecifier();
            break;
        case cqlParser.T__17:
            this.enterOuterAlt(localctx, 2);
            this.state = 288;
            this.listTypeSpecifier();
            break;
        case cqlParser.T__20:
            this.enterOuterAlt(localctx, 3);
            this.state = 289;
            this.intervalTypeSpecifier();
            break;
        case cqlParser.T__21:
            this.enterOuterAlt(localctx, 4);
            this.state = 290;
            this.tupleTypeSpecifier();
            break;
        default:
            throw new antlr4.error.NoViableAltException(this);
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function NamedTypeSpecifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_namedTypeSpecifier;
    return this;
}

NamedTypeSpecifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
NamedTypeSpecifierContext.prototype.constructor = NamedTypeSpecifierContext;

NamedTypeSpecifierContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

NamedTypeSpecifierContext.prototype.modelIdentifier = function() {
    return this.getTypedRuleContext(ModelIdentifierContext,0);
};

NamedTypeSpecifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterNamedTypeSpecifier(this);
	}
};

NamedTypeSpecifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitNamedTypeSpecifier(this);
	}
};




cqlParser.NamedTypeSpecifierContext = NamedTypeSpecifierContext;

cqlParser.prototype.namedTypeSpecifier = function() {

    var localctx = new NamedTypeSpecifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 32, cqlParser.RULE_namedTypeSpecifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 296;
        var la_ = this._interp.adaptivePredict(this._input,21,this._ctx);
        if(la_===1) {
            this.state = 293;
            this.modelIdentifier();
            this.state = 294;
            this.match(cqlParser.T__16);

        }
        this.state = 298;
        this.identifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ModelIdentifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_modelIdentifier;
    return this;
}

ModelIdentifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ModelIdentifierContext.prototype.constructor = ModelIdentifierContext;

ModelIdentifierContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

ModelIdentifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterModelIdentifier(this);
	}
};

ModelIdentifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitModelIdentifier(this);
	}
};




cqlParser.ModelIdentifierContext = ModelIdentifierContext;

cqlParser.prototype.modelIdentifier = function() {

    var localctx = new ModelIdentifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 34, cqlParser.RULE_modelIdentifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 300;
        this.identifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ListTypeSpecifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_listTypeSpecifier;
    return this;
}

ListTypeSpecifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ListTypeSpecifierContext.prototype.constructor = ListTypeSpecifierContext;

ListTypeSpecifierContext.prototype.typeSpecifier = function() {
    return this.getTypedRuleContext(TypeSpecifierContext,0);
};

ListTypeSpecifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterListTypeSpecifier(this);
	}
};

ListTypeSpecifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitListTypeSpecifier(this);
	}
};




cqlParser.ListTypeSpecifierContext = ListTypeSpecifierContext;

cqlParser.prototype.listTypeSpecifier = function() {

    var localctx = new ListTypeSpecifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 36, cqlParser.RULE_listTypeSpecifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 302;
        this.match(cqlParser.T__17);
        this.state = 303;
        this.match(cqlParser.T__18);
        this.state = 304;
        this.typeSpecifier();
        this.state = 305;
        this.match(cqlParser.T__19);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function IntervalTypeSpecifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_intervalTypeSpecifier;
    return this;
}

IntervalTypeSpecifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
IntervalTypeSpecifierContext.prototype.constructor = IntervalTypeSpecifierContext;

IntervalTypeSpecifierContext.prototype.typeSpecifier = function() {
    return this.getTypedRuleContext(TypeSpecifierContext,0);
};

IntervalTypeSpecifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterIntervalTypeSpecifier(this);
	}
};

IntervalTypeSpecifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitIntervalTypeSpecifier(this);
	}
};




cqlParser.IntervalTypeSpecifierContext = IntervalTypeSpecifierContext;

cqlParser.prototype.intervalTypeSpecifier = function() {

    var localctx = new IntervalTypeSpecifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 38, cqlParser.RULE_intervalTypeSpecifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 307;
        this.match(cqlParser.T__20);
        this.state = 308;
        this.match(cqlParser.T__18);
        this.state = 309;
        this.typeSpecifier();
        this.state = 310;
        this.match(cqlParser.T__19);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function TupleTypeSpecifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_tupleTypeSpecifier;
    return this;
}

TupleTypeSpecifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
TupleTypeSpecifierContext.prototype.constructor = TupleTypeSpecifierContext;

TupleTypeSpecifierContext.prototype.tupleElementDefinition = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(TupleElementDefinitionContext);
    } else {
        return this.getTypedRuleContext(TupleElementDefinitionContext,i);
    }
};

TupleTypeSpecifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTupleTypeSpecifier(this);
	}
};

TupleTypeSpecifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTupleTypeSpecifier(this);
	}
};




cqlParser.TupleTypeSpecifierContext = TupleTypeSpecifierContext;

cqlParser.prototype.tupleTypeSpecifier = function() {

    var localctx = new TupleTypeSpecifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 40, cqlParser.RULE_tupleTypeSpecifier);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 312;
        this.match(cqlParser.T__21);
        this.state = 313;
        this.match(cqlParser.T__22);
        this.state = 314;
        this.tupleElementDefinition();
        this.state = 319;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while(_la===cqlParser.T__14) {
            this.state = 315;
            this.match(cqlParser.T__14);
            this.state = 316;
            this.tupleElementDefinition();
            this.state = 321;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
        }
        this.state = 322;
        this.match(cqlParser.T__23);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function TupleElementDefinitionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_tupleElementDefinition;
    return this;
}

TupleElementDefinitionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
TupleElementDefinitionContext.prototype.constructor = TupleElementDefinitionContext;

TupleElementDefinitionContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

TupleElementDefinitionContext.prototype.typeSpecifier = function() {
    return this.getTypedRuleContext(TypeSpecifierContext,0);
};

TupleElementDefinitionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTupleElementDefinition(this);
	}
};

TupleElementDefinitionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTupleElementDefinition(this);
	}
};




cqlParser.TupleElementDefinitionContext = TupleElementDefinitionContext;

cqlParser.prototype.tupleElementDefinition = function() {

    var localctx = new TupleElementDefinitionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 42, cqlParser.RULE_tupleElementDefinition);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 324;
        this.identifier();
        this.state = 325;
        this.typeSpecifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function StatementContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_statement;
    return this;
}

StatementContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
StatementContext.prototype.constructor = StatementContext;

StatementContext.prototype.expressionDefinition = function() {
    return this.getTypedRuleContext(ExpressionDefinitionContext,0);
};

StatementContext.prototype.contextDefinition = function() {
    return this.getTypedRuleContext(ContextDefinitionContext,0);
};

StatementContext.prototype.functionDefinition = function() {
    return this.getTypedRuleContext(FunctionDefinitionContext,0);
};

StatementContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterStatement(this);
	}
};

StatementContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitStatement(this);
	}
};




cqlParser.StatementContext = StatementContext;

cqlParser.prototype.statement = function() {

    var localctx = new StatementContext(this, this._ctx, this.state);
    this.enterRule(localctx, 44, cqlParser.RULE_statement);
    try {
        this.state = 330;
        var la_ = this._interp.adaptivePredict(this._input,23,this._ctx);
        switch(la_) {
        case 1:
            this.enterOuterAlt(localctx, 1);
            this.state = 327;
            this.expressionDefinition();
            break;

        case 2:
            this.enterOuterAlt(localctx, 2);
            this.state = 328;
            this.contextDefinition();
            break;

        case 3:
            this.enterOuterAlt(localctx, 3);
            this.state = 329;
            this.functionDefinition();
            break;

        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ExpressionDefinitionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_expressionDefinition;
    return this;
}

ExpressionDefinitionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ExpressionDefinitionContext.prototype.constructor = ExpressionDefinitionContext;

ExpressionDefinitionContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

ExpressionDefinitionContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

ExpressionDefinitionContext.prototype.accessModifier = function() {
    return this.getTypedRuleContext(AccessModifierContext,0);
};

ExpressionDefinitionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterExpressionDefinition(this);
	}
};

ExpressionDefinitionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitExpressionDefinition(this);
	}
};




cqlParser.ExpressionDefinitionContext = ExpressionDefinitionContext;

cqlParser.prototype.expressionDefinition = function() {

    var localctx = new ExpressionDefinitionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 46, cqlParser.RULE_expressionDefinition);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 332;
        this.match(cqlParser.T__24);
        this.state = 334;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__5 || _la===cqlParser.T__6) {
            this.state = 333;
            this.accessModifier();
        }

        this.state = 336;
        this.identifier();
        this.state = 337;
        this.match(cqlParser.T__10);
        this.state = 338;
        this.expression(0);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ContextDefinitionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_contextDefinition;
    return this;
}

ContextDefinitionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ContextDefinitionContext.prototype.constructor = ContextDefinitionContext;

ContextDefinitionContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

ContextDefinitionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterContextDefinition(this);
	}
};

ContextDefinitionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitContextDefinition(this);
	}
};




cqlParser.ContextDefinitionContext = ContextDefinitionContext;

cqlParser.prototype.contextDefinition = function() {

    var localctx = new ContextDefinitionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 48, cqlParser.RULE_contextDefinition);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 340;
        this.match(cqlParser.T__25);
        this.state = 341;
        this.identifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function FunctionDefinitionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_functionDefinition;
    return this;
}

FunctionDefinitionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
FunctionDefinitionContext.prototype.constructor = FunctionDefinitionContext;

FunctionDefinitionContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

FunctionDefinitionContext.prototype.functionBody = function() {
    return this.getTypedRuleContext(FunctionBodyContext,0);
};

FunctionDefinitionContext.prototype.accessModifier = function() {
    return this.getTypedRuleContext(AccessModifierContext,0);
};

FunctionDefinitionContext.prototype.operandDefinition = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(OperandDefinitionContext);
    } else {
        return this.getTypedRuleContext(OperandDefinitionContext,i);
    }
};

FunctionDefinitionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterFunctionDefinition(this);
	}
};

FunctionDefinitionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitFunctionDefinition(this);
	}
};




cqlParser.FunctionDefinitionContext = FunctionDefinitionContext;

cqlParser.prototype.functionDefinition = function() {

    var localctx = new FunctionDefinitionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 50, cqlParser.RULE_functionDefinition);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 343;
        this.match(cqlParser.T__24);
        this.state = 345;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__5 || _la===cqlParser.T__6) {
            this.state = 344;
            this.accessModifier();
        }

        this.state = 347;
        this.match(cqlParser.T__26);
        this.state = 348;
        this.identifier();
        this.state = 349;
        this.match(cqlParser.T__13);
        this.state = 358;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__1 || ((((_la - 75)) & ~0x1f) == 0 && ((1 << (_la - 75)) & ((1 << (cqlParser.T__74 - 75)) | (1 << (cqlParser.T__75 - 75)) | (1 << (cqlParser.T__76 - 75)))) !== 0) || ((((_la - 127)) & ~0x1f) == 0 && ((1 << (_la - 127)) & ((1 << (cqlParser.T__126 - 127)) | (1 << (cqlParser.T__127 - 127)) | (1 << (cqlParser.T__128 - 127)) | (1 << (cqlParser.IDENTIFIER - 127)) | (1 << (cqlParser.QUOTEDIDENTIFIER - 127)))) !== 0)) {
            this.state = 350;
            this.operandDefinition();
            this.state = 355;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
            while(_la===cqlParser.T__14) {
                this.state = 351;
                this.match(cqlParser.T__14);
                this.state = 352;
                this.operandDefinition();
                this.state = 357;
                this._errHandler.sync(this);
                _la = this._input.LA(1);
            }
        }

        this.state = 360;
        this.match(cqlParser.T__15);
        this.state = 361;
        this.match(cqlParser.T__10);
        this.state = 362;
        this.functionBody();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function OperandDefinitionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_operandDefinition;
    return this;
}

OperandDefinitionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
OperandDefinitionContext.prototype.constructor = OperandDefinitionContext;

OperandDefinitionContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

OperandDefinitionContext.prototype.typeSpecifier = function() {
    return this.getTypedRuleContext(TypeSpecifierContext,0);
};

OperandDefinitionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterOperandDefinition(this);
	}
};

OperandDefinitionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitOperandDefinition(this);
	}
};




cqlParser.OperandDefinitionContext = OperandDefinitionContext;

cqlParser.prototype.operandDefinition = function() {

    var localctx = new OperandDefinitionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 52, cqlParser.RULE_operandDefinition);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 364;
        this.identifier();
        this.state = 365;
        this.typeSpecifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function FunctionBodyContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_functionBody;
    return this;
}

FunctionBodyContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
FunctionBodyContext.prototype.constructor = FunctionBodyContext;

FunctionBodyContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

FunctionBodyContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterFunctionBody(this);
	}
};

FunctionBodyContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitFunctionBody(this);
	}
};




cqlParser.FunctionBodyContext = FunctionBodyContext;

cqlParser.prototype.functionBody = function() {

    var localctx = new FunctionBodyContext(this, this._ctx, this.state);
    this.enterRule(localctx, 54, cqlParser.RULE_functionBody);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 367;
        this.expression(0);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function QuerySourceContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_querySource;
    return this;
}

QuerySourceContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
QuerySourceContext.prototype.constructor = QuerySourceContext;

QuerySourceContext.prototype.retrieve = function() {
    return this.getTypedRuleContext(RetrieveContext,0);
};

QuerySourceContext.prototype.qualifiedIdentifier = function() {
    return this.getTypedRuleContext(QualifiedIdentifierContext,0);
};

QuerySourceContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

QuerySourceContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterQuerySource(this);
	}
};

QuerySourceContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitQuerySource(this);
	}
};




cqlParser.QuerySourceContext = QuerySourceContext;

cqlParser.prototype.querySource = function() {

    var localctx = new QuerySourceContext(this, this._ctx, this.state);
    this.enterRule(localctx, 56, cqlParser.RULE_querySource);
    try {
        this.state = 375;
        switch(this._input.LA(1)) {
        case cqlParser.T__30:
            this.enterOuterAlt(localctx, 1);
            this.state = 369;
            this.retrieve();
            break;
        case cqlParser.T__1:
        case cqlParser.T__74:
        case cqlParser.T__75:
        case cqlParser.T__76:
        case cqlParser.T__126:
        case cqlParser.T__127:
        case cqlParser.T__128:
        case cqlParser.IDENTIFIER:
        case cqlParser.QUOTEDIDENTIFIER:
            this.enterOuterAlt(localctx, 2);
            this.state = 370;
            this.qualifiedIdentifier();
            break;
        case cqlParser.T__13:
            this.enterOuterAlt(localctx, 3);
            this.state = 371;
            this.match(cqlParser.T__13);
            this.state = 372;
            this.expression(0);
            this.state = 373;
            this.match(cqlParser.T__15);
            break;
        default:
            throw new antlr4.error.NoViableAltException(this);
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function AliasedQuerySourceContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_aliasedQuerySource;
    return this;
}

AliasedQuerySourceContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
AliasedQuerySourceContext.prototype.constructor = AliasedQuerySourceContext;

AliasedQuerySourceContext.prototype.querySource = function() {
    return this.getTypedRuleContext(QuerySourceContext,0);
};

AliasedQuerySourceContext.prototype.alias = function() {
    return this.getTypedRuleContext(AliasContext,0);
};

AliasedQuerySourceContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterAliasedQuerySource(this);
	}
};

AliasedQuerySourceContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitAliasedQuerySource(this);
	}
};




cqlParser.AliasedQuerySourceContext = AliasedQuerySourceContext;

cqlParser.prototype.aliasedQuerySource = function() {

    var localctx = new AliasedQuerySourceContext(this, this._ctx, this.state);
    this.enterRule(localctx, 58, cqlParser.RULE_aliasedQuerySource);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 377;
        this.querySource();
        this.state = 378;
        this.alias();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function AliasContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_alias;
    return this;
}

AliasContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
AliasContext.prototype.constructor = AliasContext;

AliasContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

AliasContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterAlias(this);
	}
};

AliasContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitAlias(this);
	}
};




cqlParser.AliasContext = AliasContext;

cqlParser.prototype.alias = function() {

    var localctx = new AliasContext(this, this._ctx, this.state);
    this.enterRule(localctx, 60, cqlParser.RULE_alias);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 380;
        this.identifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function QueryInclusionClauseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_queryInclusionClause;
    return this;
}

QueryInclusionClauseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
QueryInclusionClauseContext.prototype.constructor = QueryInclusionClauseContext;

QueryInclusionClauseContext.prototype.withClause = function() {
    return this.getTypedRuleContext(WithClauseContext,0);
};

QueryInclusionClauseContext.prototype.withoutClause = function() {
    return this.getTypedRuleContext(WithoutClauseContext,0);
};

QueryInclusionClauseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterQueryInclusionClause(this);
	}
};

QueryInclusionClauseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitQueryInclusionClause(this);
	}
};




cqlParser.QueryInclusionClauseContext = QueryInclusionClauseContext;

cqlParser.prototype.queryInclusionClause = function() {

    var localctx = new QueryInclusionClauseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 62, cqlParser.RULE_queryInclusionClause);
    try {
        this.state = 384;
        switch(this._input.LA(1)) {
        case cqlParser.T__27:
            this.enterOuterAlt(localctx, 1);
            this.state = 382;
            this.withClause();
            break;
        case cqlParser.T__29:
            this.enterOuterAlt(localctx, 2);
            this.state = 383;
            this.withoutClause();
            break;
        default:
            throw new antlr4.error.NoViableAltException(this);
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function WithClauseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_withClause;
    return this;
}

WithClauseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
WithClauseContext.prototype.constructor = WithClauseContext;

WithClauseContext.prototype.aliasedQuerySource = function() {
    return this.getTypedRuleContext(AliasedQuerySourceContext,0);
};

WithClauseContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

WithClauseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterWithClause(this);
	}
};

WithClauseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitWithClause(this);
	}
};




cqlParser.WithClauseContext = WithClauseContext;

cqlParser.prototype.withClause = function() {

    var localctx = new WithClauseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 64, cqlParser.RULE_withClause);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 386;
        this.match(cqlParser.T__27);
        this.state = 387;
        this.aliasedQuerySource();
        this.state = 388;
        this.match(cqlParser.T__28);
        this.state = 389;
        this.expression(0);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function WithoutClauseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_withoutClause;
    return this;
}

WithoutClauseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
WithoutClauseContext.prototype.constructor = WithoutClauseContext;

WithoutClauseContext.prototype.aliasedQuerySource = function() {
    return this.getTypedRuleContext(AliasedQuerySourceContext,0);
};

WithoutClauseContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

WithoutClauseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterWithoutClause(this);
	}
};

WithoutClauseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitWithoutClause(this);
	}
};




cqlParser.WithoutClauseContext = WithoutClauseContext;

cqlParser.prototype.withoutClause = function() {

    var localctx = new WithoutClauseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 66, cqlParser.RULE_withoutClause);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 391;
        this.match(cqlParser.T__29);
        this.state = 392;
        this.aliasedQuerySource();
        this.state = 393;
        this.match(cqlParser.T__28);
        this.state = 394;
        this.expression(0);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function RetrieveContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_retrieve;
    return this;
}

RetrieveContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
RetrieveContext.prototype.constructor = RetrieveContext;

RetrieveContext.prototype.namedTypeSpecifier = function() {
    return this.getTypedRuleContext(NamedTypeSpecifierContext,0);
};

RetrieveContext.prototype.valueset = function() {
    return this.getTypedRuleContext(ValuesetContext,0);
};

RetrieveContext.prototype.valuesetPathIdentifier = function() {
    return this.getTypedRuleContext(ValuesetPathIdentifierContext,0);
};

RetrieveContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterRetrieve(this);
	}
};

RetrieveContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitRetrieve(this);
	}
};




cqlParser.RetrieveContext = RetrieveContext;

cqlParser.prototype.retrieve = function() {

    var localctx = new RetrieveContext(this, this._ctx, this.state);
    this.enterRule(localctx, 68, cqlParser.RULE_retrieve);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 396;
        this.match(cqlParser.T__30);
        this.state = 397;
        this.namedTypeSpecifier();
        this.state = 405;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__10) {
            this.state = 398;
            this.match(cqlParser.T__10);
            this.state = 402;
            var la_ = this._interp.adaptivePredict(this._input,30,this._ctx);
            if(la_===1) {
                this.state = 399;
                this.valuesetPathIdentifier();
                this.state = 400;
                this.match(cqlParser.T__31);

            }
            this.state = 404;
            this.valueset();
        }

        this.state = 407;
        this.match(cqlParser.T__32);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ValuesetPathIdentifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_valuesetPathIdentifier;
    return this;
}

ValuesetPathIdentifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ValuesetPathIdentifierContext.prototype.constructor = ValuesetPathIdentifierContext;

ValuesetPathIdentifierContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

ValuesetPathIdentifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterValuesetPathIdentifier(this);
	}
};

ValuesetPathIdentifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitValuesetPathIdentifier(this);
	}
};




cqlParser.ValuesetPathIdentifierContext = ValuesetPathIdentifierContext;

cqlParser.prototype.valuesetPathIdentifier = function() {

    var localctx = new ValuesetPathIdentifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 70, cqlParser.RULE_valuesetPathIdentifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 409;
        this.identifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ValuesetContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_valueset;
    return this;
}

ValuesetContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ValuesetContext.prototype.constructor = ValuesetContext;

ValuesetContext.prototype.qualifiedIdentifier = function() {
    return this.getTypedRuleContext(QualifiedIdentifierContext,0);
};

ValuesetContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterValueset(this);
	}
};

ValuesetContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitValueset(this);
	}
};




cqlParser.ValuesetContext = ValuesetContext;

cqlParser.prototype.valueset = function() {

    var localctx = new ValuesetContext(this, this._ctx, this.state);
    this.enterRule(localctx, 72, cqlParser.RULE_valueset);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 411;
        this.qualifiedIdentifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function QualifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_qualifier;
    return this;
}

QualifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
QualifierContext.prototype.constructor = QualifierContext;

QualifierContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

QualifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterQualifier(this);
	}
};

QualifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitQualifier(this);
	}
};




cqlParser.QualifierContext = QualifierContext;

cqlParser.prototype.qualifier = function() {

    var localctx = new QualifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 74, cqlParser.RULE_qualifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 413;
        this.identifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function QueryContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_query;
    return this;
}

QueryContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
QueryContext.prototype.constructor = QueryContext;

QueryContext.prototype.sourceClause = function() {
    return this.getTypedRuleContext(SourceClauseContext,0);
};

QueryContext.prototype.defineClause = function() {
    return this.getTypedRuleContext(DefineClauseContext,0);
};

QueryContext.prototype.queryInclusionClause = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(QueryInclusionClauseContext);
    } else {
        return this.getTypedRuleContext(QueryInclusionClauseContext,i);
    }
};

QueryContext.prototype.whereClause = function() {
    return this.getTypedRuleContext(WhereClauseContext,0);
};

QueryContext.prototype.returnClause = function() {
    return this.getTypedRuleContext(ReturnClauseContext,0);
};

QueryContext.prototype.sortClause = function() {
    return this.getTypedRuleContext(SortClauseContext,0);
};

QueryContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterQuery(this);
	}
};

QueryContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitQuery(this);
	}
};




cqlParser.QueryContext = QueryContext;

cqlParser.prototype.query = function() {

    var localctx = new QueryContext(this, this._ctx, this.state);
    this.enterRule(localctx, 76, cqlParser.RULE_query);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 415;
        this.sourceClause();
        this.state = 417;
        var la_ = this._interp.adaptivePredict(this._input,32,this._ctx);
        if(la_===1) {
            this.state = 416;
            this.defineClause();

        }
        this.state = 422;
        this._errHandler.sync(this);
        var _alt = this._interp.adaptivePredict(this._input,33,this._ctx)
        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
            if(_alt===1) {
                this.state = 419;
                this.queryInclusionClause(); 
            }
            this.state = 424;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input,33,this._ctx);
        }

        this.state = 426;
        var la_ = this._interp.adaptivePredict(this._input,34,this._ctx);
        if(la_===1) {
            this.state = 425;
            this.whereClause();

        }
        this.state = 429;
        var la_ = this._interp.adaptivePredict(this._input,35,this._ctx);
        if(la_===1) {
            this.state = 428;
            this.returnClause();

        }
        this.state = 432;
        var la_ = this._interp.adaptivePredict(this._input,36,this._ctx);
        if(la_===1) {
            this.state = 431;
            this.sortClause();

        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function SourceClauseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_sourceClause;
    return this;
}

SourceClauseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
SourceClauseContext.prototype.constructor = SourceClauseContext;

SourceClauseContext.prototype.singleSourceClause = function() {
    return this.getTypedRuleContext(SingleSourceClauseContext,0);
};

SourceClauseContext.prototype.multipleSourceClause = function() {
    return this.getTypedRuleContext(MultipleSourceClauseContext,0);
};

SourceClauseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterSourceClause(this);
	}
};

SourceClauseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitSourceClause(this);
	}
};




cqlParser.SourceClauseContext = SourceClauseContext;

cqlParser.prototype.sourceClause = function() {

    var localctx = new SourceClauseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 78, cqlParser.RULE_sourceClause);
    try {
        this.state = 436;
        switch(this._input.LA(1)) {
        case cqlParser.T__1:
        case cqlParser.T__13:
        case cqlParser.T__30:
        case cqlParser.T__74:
        case cqlParser.T__75:
        case cqlParser.T__76:
        case cqlParser.T__126:
        case cqlParser.T__127:
        case cqlParser.T__128:
        case cqlParser.IDENTIFIER:
        case cqlParser.QUOTEDIDENTIFIER:
            this.enterOuterAlt(localctx, 1);
            this.state = 434;
            this.singleSourceClause();
            break;
        case cqlParser.T__33:
            this.enterOuterAlt(localctx, 2);
            this.state = 435;
            this.multipleSourceClause();
            break;
        default:
            throw new antlr4.error.NoViableAltException(this);
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function SingleSourceClauseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_singleSourceClause;
    return this;
}

SingleSourceClauseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
SingleSourceClauseContext.prototype.constructor = SingleSourceClauseContext;

SingleSourceClauseContext.prototype.aliasedQuerySource = function() {
    return this.getTypedRuleContext(AliasedQuerySourceContext,0);
};

SingleSourceClauseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterSingleSourceClause(this);
	}
};

SingleSourceClauseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitSingleSourceClause(this);
	}
};




cqlParser.SingleSourceClauseContext = SingleSourceClauseContext;

cqlParser.prototype.singleSourceClause = function() {

    var localctx = new SingleSourceClauseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 80, cqlParser.RULE_singleSourceClause);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 438;
        this.aliasedQuerySource();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function MultipleSourceClauseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_multipleSourceClause;
    return this;
}

MultipleSourceClauseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
MultipleSourceClauseContext.prototype.constructor = MultipleSourceClauseContext;

MultipleSourceClauseContext.prototype.aliasedQuerySource = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(AliasedQuerySourceContext);
    } else {
        return this.getTypedRuleContext(AliasedQuerySourceContext,i);
    }
};

MultipleSourceClauseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterMultipleSourceClause(this);
	}
};

MultipleSourceClauseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitMultipleSourceClause(this);
	}
};




cqlParser.MultipleSourceClauseContext = MultipleSourceClauseContext;

cqlParser.prototype.multipleSourceClause = function() {

    var localctx = new MultipleSourceClauseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 82, cqlParser.RULE_multipleSourceClause);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 440;
        this.match(cqlParser.T__33);
        this.state = 441;
        this.aliasedQuerySource();
        this.state = 446;
        this._errHandler.sync(this);
        var _alt = this._interp.adaptivePredict(this._input,38,this._ctx)
        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
            if(_alt===1) {
                this.state = 442;
                this.match(cqlParser.T__14);
                this.state = 443;
                this.aliasedQuerySource(); 
            }
            this.state = 448;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input,38,this._ctx);
        }

    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function DefineClauseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_defineClause;
    return this;
}

DefineClauseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
DefineClauseContext.prototype.constructor = DefineClauseContext;

DefineClauseContext.prototype.defineClauseItem = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(DefineClauseItemContext);
    } else {
        return this.getTypedRuleContext(DefineClauseItemContext,i);
    }
};

DefineClauseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterDefineClause(this);
	}
};

DefineClauseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitDefineClause(this);
	}
};




cqlParser.DefineClauseContext = DefineClauseContext;

cqlParser.prototype.defineClause = function() {

    var localctx = new DefineClauseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 84, cqlParser.RULE_defineClause);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 449;
        this.match(cqlParser.T__24);
        this.state = 450;
        this.defineClauseItem();
        this.state = 455;
        this._errHandler.sync(this);
        var _alt = this._interp.adaptivePredict(this._input,39,this._ctx)
        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
            if(_alt===1) {
                this.state = 451;
                this.match(cqlParser.T__14);
                this.state = 452;
                this.defineClauseItem(); 
            }
            this.state = 457;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input,39,this._ctx);
        }

    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function DefineClauseItemContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_defineClauseItem;
    return this;
}

DefineClauseItemContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
DefineClauseItemContext.prototype.constructor = DefineClauseItemContext;

DefineClauseItemContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

DefineClauseItemContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

DefineClauseItemContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterDefineClauseItem(this);
	}
};

DefineClauseItemContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitDefineClauseItem(this);
	}
};




cqlParser.DefineClauseItemContext = DefineClauseItemContext;

cqlParser.prototype.defineClauseItem = function() {

    var localctx = new DefineClauseItemContext(this, this._ctx, this.state);
    this.enterRule(localctx, 86, cqlParser.RULE_defineClauseItem);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 458;
        this.identifier();
        this.state = 459;
        this.match(cqlParser.T__10);
        this.state = 460;
        this.expression(0);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function WhereClauseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_whereClause;
    return this;
}

WhereClauseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
WhereClauseContext.prototype.constructor = WhereClauseContext;

WhereClauseContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

WhereClauseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterWhereClause(this);
	}
};

WhereClauseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitWhereClause(this);
	}
};




cqlParser.WhereClauseContext = WhereClauseContext;

cqlParser.prototype.whereClause = function() {

    var localctx = new WhereClauseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 88, cqlParser.RULE_whereClause);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 462;
        this.match(cqlParser.T__34);
        this.state = 463;
        this.expression(0);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ReturnClauseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_returnClause;
    return this;
}

ReturnClauseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ReturnClauseContext.prototype.constructor = ReturnClauseContext;

ReturnClauseContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

ReturnClauseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterReturnClause(this);
	}
};

ReturnClauseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitReturnClause(this);
	}
};




cqlParser.ReturnClauseContext = ReturnClauseContext;

cqlParser.prototype.returnClause = function() {

    var localctx = new ReturnClauseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 90, cqlParser.RULE_returnClause);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 465;
        this.match(cqlParser.T__35);
        this.state = 467;
        var la_ = this._interp.adaptivePredict(this._input,40,this._ctx);
        if(la_===1) {
            this.state = 466;
            _la = this._input.LA(1);
            if(!(_la===cqlParser.T__36 || _la===cqlParser.T__37)) {
            this._errHandler.recoverInline(this);
            }
            else {
                this.consume();
            }

        }
        this.state = 469;
        this.expression(0);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function SortClauseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_sortClause;
    return this;
}

SortClauseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
SortClauseContext.prototype.constructor = SortClauseContext;

SortClauseContext.prototype.sortDirection = function() {
    return this.getTypedRuleContext(SortDirectionContext,0);
};

SortClauseContext.prototype.sortByItem = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(SortByItemContext);
    } else {
        return this.getTypedRuleContext(SortByItemContext,i);
    }
};

SortClauseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterSortClause(this);
	}
};

SortClauseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitSortClause(this);
	}
};




cqlParser.SortClauseContext = SortClauseContext;

cqlParser.prototype.sortClause = function() {

    var localctx = new SortClauseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 92, cqlParser.RULE_sortClause);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 471;
        this.match(cqlParser.T__38);
        this.state = 482;
        switch(this._input.LA(1)) {
        case cqlParser.T__40:
        case cqlParser.T__41:
        case cqlParser.T__42:
        case cqlParser.T__43:
            this.state = 472;
            this.sortDirection();
            break;
        case cqlParser.T__39:
            this.state = 473;
            this.match(cqlParser.T__39);
            this.state = 474;
            this.sortByItem();
            this.state = 479;
            this._errHandler.sync(this);
            var _alt = this._interp.adaptivePredict(this._input,41,this._ctx)
            while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
                if(_alt===1) {
                    this.state = 475;
                    this.match(cqlParser.T__14);
                    this.state = 476;
                    this.sortByItem(); 
                }
                this.state = 481;
                this._errHandler.sync(this);
                _alt = this._interp.adaptivePredict(this._input,41,this._ctx);
            }

            break;
        default:
            throw new antlr4.error.NoViableAltException(this);
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function SortDirectionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_sortDirection;
    return this;
}

SortDirectionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
SortDirectionContext.prototype.constructor = SortDirectionContext;


SortDirectionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterSortDirection(this);
	}
};

SortDirectionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitSortDirection(this);
	}
};




cqlParser.SortDirectionContext = SortDirectionContext;

cqlParser.prototype.sortDirection = function() {

    var localctx = new SortDirectionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 94, cqlParser.RULE_sortDirection);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 484;
        _la = this._input.LA(1);
        if(!(((((_la - 41)) & ~0x1f) == 0 && ((1 << (_la - 41)) & ((1 << (cqlParser.T__40 - 41)) | (1 << (cqlParser.T__41 - 41)) | (1 << (cqlParser.T__42 - 41)) | (1 << (cqlParser.T__43 - 41)))) !== 0))) {
        this._errHandler.recoverInline(this);
        }
        else {
            this.consume();
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function SortByItemContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_sortByItem;
    return this;
}

SortByItemContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
SortByItemContext.prototype.constructor = SortByItemContext;

SortByItemContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};

SortByItemContext.prototype.sortDirection = function() {
    return this.getTypedRuleContext(SortDirectionContext,0);
};

SortByItemContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterSortByItem(this);
	}
};

SortByItemContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitSortByItem(this);
	}
};




cqlParser.SortByItemContext = SortByItemContext;

cqlParser.prototype.sortByItem = function() {

    var localctx = new SortByItemContext(this, this._ctx, this.state);
    this.enterRule(localctx, 96, cqlParser.RULE_sortByItem);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 486;
        this.expressionTerm(0);
        this.state = 488;
        var la_ = this._interp.adaptivePredict(this._input,43,this._ctx);
        if(la_===1) {
            this.state = 487;
            this.sortDirection();

        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function QualifiedIdentifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_qualifiedIdentifier;
    return this;
}

QualifiedIdentifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
QualifiedIdentifierContext.prototype.constructor = QualifiedIdentifierContext;

QualifiedIdentifierContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

QualifiedIdentifierContext.prototype.qualifier = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(QualifierContext);
    } else {
        return this.getTypedRuleContext(QualifierContext,i);
    }
};

QualifiedIdentifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterQualifiedIdentifier(this);
	}
};

QualifiedIdentifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitQualifiedIdentifier(this);
	}
};




cqlParser.QualifiedIdentifierContext = QualifiedIdentifierContext;

cqlParser.prototype.qualifiedIdentifier = function() {

    var localctx = new QualifiedIdentifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 98, cqlParser.RULE_qualifiedIdentifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 495;
        this._errHandler.sync(this);
        var _alt = this._interp.adaptivePredict(this._input,44,this._ctx)
        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
            if(_alt===1) {
                this.state = 490;
                this.qualifier();
                this.state = 491;
                this.match(cqlParser.T__16); 
            }
            this.state = 497;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input,44,this._ctx);
        }

        this.state = 498;
        this.identifier();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ExpressionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_expression;
    return this;
}

ExpressionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ExpressionContext.prototype.constructor = ExpressionContext;


 
ExpressionContext.prototype.copyFrom = function(ctx) {
    antlr4.ParserRuleContext.prototype.copyFrom.call(this, ctx);
};

function DurationBetweenExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

DurationBetweenExpressionContext.prototype = Object.create(ExpressionContext.prototype);
DurationBetweenExpressionContext.prototype.constructor = DurationBetweenExpressionContext;

cqlParser.DurationBetweenExpressionContext = DurationBetweenExpressionContext;

DurationBetweenExpressionContext.prototype.pluralDateTimePrecision = function() {
    return this.getTypedRuleContext(PluralDateTimePrecisionContext,0);
};

DurationBetweenExpressionContext.prototype.expressionTerm = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionTermContext);
    } else {
        return this.getTypedRuleContext(ExpressionTermContext,i);
    }
};
DurationBetweenExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterDurationBetweenExpression(this);
	}
};

DurationBetweenExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitDurationBetweenExpression(this);
	}
};


function InFixSetExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

InFixSetExpressionContext.prototype = Object.create(ExpressionContext.prototype);
InFixSetExpressionContext.prototype.constructor = InFixSetExpressionContext;

cqlParser.InFixSetExpressionContext = InFixSetExpressionContext;

InFixSetExpressionContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};
InFixSetExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterInFixSetExpression(this);
	}
};

InFixSetExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitInFixSetExpression(this);
	}
};


function RetrieveExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

RetrieveExpressionContext.prototype = Object.create(ExpressionContext.prototype);
RetrieveExpressionContext.prototype.constructor = RetrieveExpressionContext;

cqlParser.RetrieveExpressionContext = RetrieveExpressionContext;

RetrieveExpressionContext.prototype.retrieve = function() {
    return this.getTypedRuleContext(RetrieveContext,0);
};
RetrieveExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterRetrieveExpression(this);
	}
};

RetrieveExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitRetrieveExpression(this);
	}
};


function TimingExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

TimingExpressionContext.prototype = Object.create(ExpressionContext.prototype);
TimingExpressionContext.prototype.constructor = TimingExpressionContext;

cqlParser.TimingExpressionContext = TimingExpressionContext;

TimingExpressionContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};

TimingExpressionContext.prototype.intervalOperatorPhrase = function() {
    return this.getTypedRuleContext(IntervalOperatorPhraseContext,0);
};
TimingExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTimingExpression(this);
	}
};

TimingExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTimingExpression(this);
	}
};


function NotExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

NotExpressionContext.prototype = Object.create(ExpressionContext.prototype);
NotExpressionContext.prototype.constructor = NotExpressionContext;

cqlParser.NotExpressionContext = NotExpressionContext;

NotExpressionContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};
NotExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterNotExpression(this);
	}
};

NotExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitNotExpression(this);
	}
};


function QueryExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

QueryExpressionContext.prototype = Object.create(ExpressionContext.prototype);
QueryExpressionContext.prototype.constructor = QueryExpressionContext;

cqlParser.QueryExpressionContext = QueryExpressionContext;

QueryExpressionContext.prototype.query = function() {
    return this.getTypedRuleContext(QueryContext,0);
};
QueryExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterQueryExpression(this);
	}
};

QueryExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitQueryExpression(this);
	}
};


function BooleanExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

BooleanExpressionContext.prototype = Object.create(ExpressionContext.prototype);
BooleanExpressionContext.prototype.constructor = BooleanExpressionContext;

cqlParser.BooleanExpressionContext = BooleanExpressionContext;

BooleanExpressionContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};
BooleanExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterBooleanExpression(this);
	}
};

BooleanExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitBooleanExpression(this);
	}
};


function OrExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

OrExpressionContext.prototype = Object.create(ExpressionContext.prototype);
OrExpressionContext.prototype.constructor = OrExpressionContext;

cqlParser.OrExpressionContext = OrExpressionContext;

OrExpressionContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};
OrExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterOrExpression(this);
	}
};

OrExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitOrExpression(this);
	}
};


function CastExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

CastExpressionContext.prototype = Object.create(ExpressionContext.prototype);
CastExpressionContext.prototype.constructor = CastExpressionContext;

cqlParser.CastExpressionContext = CastExpressionContext;

CastExpressionContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

CastExpressionContext.prototype.typeSpecifier = function() {
    return this.getTypedRuleContext(TypeSpecifierContext,0);
};
CastExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterCastExpression(this);
	}
};

CastExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitCastExpression(this);
	}
};


function AndExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

AndExpressionContext.prototype = Object.create(ExpressionContext.prototype);
AndExpressionContext.prototype.constructor = AndExpressionContext;

cqlParser.AndExpressionContext = AndExpressionContext;

AndExpressionContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};
AndExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterAndExpression(this);
	}
};

AndExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitAndExpression(this);
	}
};


function BetweenExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

BetweenExpressionContext.prototype = Object.create(ExpressionContext.prototype);
BetweenExpressionContext.prototype.constructor = BetweenExpressionContext;

cqlParser.BetweenExpressionContext = BetweenExpressionContext;

BetweenExpressionContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

BetweenExpressionContext.prototype.expressionTerm = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionTermContext);
    } else {
        return this.getTypedRuleContext(ExpressionTermContext,i);
    }
};
BetweenExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterBetweenExpression(this);
	}
};

BetweenExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitBetweenExpression(this);
	}
};


function MembershipExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

MembershipExpressionContext.prototype = Object.create(ExpressionContext.prototype);
MembershipExpressionContext.prototype.constructor = MembershipExpressionContext;

cqlParser.MembershipExpressionContext = MembershipExpressionContext;

MembershipExpressionContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};

MembershipExpressionContext.prototype.dateTimePrecisionSpecifier = function() {
    return this.getTypedRuleContext(DateTimePrecisionSpecifierContext,0);
};
MembershipExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterMembershipExpression(this);
	}
};

MembershipExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitMembershipExpression(this);
	}
};


function DifferenceBetweenExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

DifferenceBetweenExpressionContext.prototype = Object.create(ExpressionContext.prototype);
DifferenceBetweenExpressionContext.prototype.constructor = DifferenceBetweenExpressionContext;

cqlParser.DifferenceBetweenExpressionContext = DifferenceBetweenExpressionContext;

DifferenceBetweenExpressionContext.prototype.pluralDateTimePrecision = function() {
    return this.getTypedRuleContext(PluralDateTimePrecisionContext,0);
};

DifferenceBetweenExpressionContext.prototype.expressionTerm = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionTermContext);
    } else {
        return this.getTypedRuleContext(ExpressionTermContext,i);
    }
};
DifferenceBetweenExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterDifferenceBetweenExpression(this);
	}
};

DifferenceBetweenExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitDifferenceBetweenExpression(this);
	}
};


function InequalityExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

InequalityExpressionContext.prototype = Object.create(ExpressionContext.prototype);
InequalityExpressionContext.prototype.constructor = InequalityExpressionContext;

cqlParser.InequalityExpressionContext = InequalityExpressionContext;

InequalityExpressionContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};
InequalityExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterInequalityExpression(this);
	}
};

InequalityExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitInequalityExpression(this);
	}
};


function EqualityExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

EqualityExpressionContext.prototype = Object.create(ExpressionContext.prototype);
EqualityExpressionContext.prototype.constructor = EqualityExpressionContext;

cqlParser.EqualityExpressionContext = EqualityExpressionContext;

EqualityExpressionContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};
EqualityExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterEqualityExpression(this);
	}
};

EqualityExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitEqualityExpression(this);
	}
};


function ExistenceExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

ExistenceExpressionContext.prototype = Object.create(ExpressionContext.prototype);
ExistenceExpressionContext.prototype.constructor = ExistenceExpressionContext;

cqlParser.ExistenceExpressionContext = ExistenceExpressionContext;

ExistenceExpressionContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};
ExistenceExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterExistenceExpression(this);
	}
};

ExistenceExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitExistenceExpression(this);
	}
};


function TermExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

TermExpressionContext.prototype = Object.create(ExpressionContext.prototype);
TermExpressionContext.prototype.constructor = TermExpressionContext;

cqlParser.TermExpressionContext = TermExpressionContext;

TermExpressionContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};
TermExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTermExpression(this);
	}
};

TermExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTermExpression(this);
	}
};


function TypeExpressionContext(parser, ctx) {
	ExpressionContext.call(this, parser);
    ExpressionContext.prototype.copyFrom.call(this, ctx);
    return this;
}

TypeExpressionContext.prototype = Object.create(ExpressionContext.prototype);
TypeExpressionContext.prototype.constructor = TypeExpressionContext;

cqlParser.TypeExpressionContext = TypeExpressionContext;

TypeExpressionContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

TypeExpressionContext.prototype.typeSpecifier = function() {
    return this.getTypedRuleContext(TypeSpecifierContext,0);
};
TypeExpressionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTypeExpression(this);
	}
};

TypeExpressionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTypeExpression(this);
	}
};



cqlParser.prototype.expression = function(_p) {
	if(_p===undefined) {
	    _p = 0;
	}
    var _parentctx = this._ctx;
    var _parentState = this.state;
    var localctx = new ExpressionContext(this, this._ctx, _parentState);
    var _prevctx = localctx;
    var _startState = 100;
    this.enterRecursionRule(localctx, 100, cqlParser.RULE_expression, _p);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 527;
        var la_ = this._interp.adaptivePredict(this._input,45,this._ctx);
        switch(la_) {
        case 1:
            localctx = new NotExpressionContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;

            this.state = 501;
            this.match(cqlParser.T__45);
            this.state = 502;
            this.expression(12);
            break;

        case 2:
            localctx = new ExistenceExpressionContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 503;
            this.match(cqlParser.T__51);
            this.state = 504;
            this.expression(11);
            break;

        case 3:
            localctx = new TermExpressionContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 505;
            this.expressionTerm(0);
            break;

        case 4:
            localctx = new RetrieveExpressionContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 506;
            this.retrieve();
            break;

        case 5:
            localctx = new QueryExpressionContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 507;
            this.query();
            break;

        case 6:
            localctx = new CastExpressionContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 508;
            this.match(cqlParser.T__50);
            this.state = 509;
            this.expression(0);
            this.state = 510;
            this.match(cqlParser.T__49);
            this.state = 511;
            this.typeSpecifier();
            break;

        case 7:
            localctx = new DurationBetweenExpressionContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 513;
            this.pluralDateTimePrecision();
            this.state = 514;
            this.match(cqlParser.T__53);
            this.state = 515;
            this.expressionTerm(0);
            this.state = 516;
            this.match(cqlParser.T__54);
            this.state = 517;
            this.expressionTerm(0);
            break;

        case 8:
            localctx = new DifferenceBetweenExpressionContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 519;
            this.match(cqlParser.T__55);
            this.state = 520;
            this.match(cqlParser.T__31);
            this.state = 521;
            this.pluralDateTimePrecision();
            this.state = 522;
            this.match(cqlParser.T__53);
            this.state = 523;
            this.expressionTerm(0);
            this.state = 524;
            this.match(cqlParser.T__54);
            this.state = 525;
            this.expressionTerm(0);
            break;

        }
        this._ctx.stop = this._input.LT(-1);
        this.state = 574;
        this._errHandler.sync(this);
        var _alt = this._interp.adaptivePredict(this._input,50,this._ctx)
        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
            if(_alt===1) {
                if(this._parseListeners!==null) {
                    this.triggerExitRuleEvent();
                }
                _prevctx = localctx;
                this.state = 572;
                var la_ = this._interp.adaptivePredict(this._input,49,this._ctx);
                switch(la_) {
                case 1:
                    localctx = new InequalityExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expression);
                    this.state = 529;
                    if (!( this.precpred(this._ctx, 7))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 7)");
                    }
                    this.state = 530;
                    _la = this._input.LA(1);
                    if(!(_la===cqlParser.T__18 || _la===cqlParser.T__19 || _la===cqlParser.T__56 || _la===cqlParser.T__57)) {
                    this._errHandler.recoverInline(this);
                    }
                    else {
                        this.consume();
                    }
                    this.state = 531;
                    this.expression(8);
                    break;

                case 2:
                    localctx = new TimingExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expression);
                    this.state = 532;
                    if (!( this.precpred(this._ctx, 6))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 6)");
                    }
                    this.state = 533;
                    this.intervalOperatorPhrase();
                    this.state = 534;
                    this.expression(7);
                    break;

                case 3:
                    localctx = new EqualityExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expression);
                    this.state = 536;
                    if (!( this.precpred(this._ctx, 5))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 5)");
                    }
                    this.state = 537;
                    _la = this._input.LA(1);
                    if(!(((((_la - 59)) & ~0x1f) == 0 && ((1 << (_la - 59)) & ((1 << (cqlParser.T__58 - 59)) | (1 << (cqlParser.T__59 - 59)) | (1 << (cqlParser.T__60 - 59)))) !== 0))) {
                    this._errHandler.recoverInline(this);
                    }
                    else {
                        this.consume();
                    }
                    this.state = 538;
                    this.expression(6);
                    break;

                case 4:
                    localctx = new MembershipExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expression);
                    this.state = 539;
                    if (!( this.precpred(this._ctx, 4))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 4)");
                    }
                    this.state = 540;
                    _la = this._input.LA(1);
                    if(!(_la===cqlParser.T__31 || _la===cqlParser.T__61)) {
                    this._errHandler.recoverInline(this);
                    }
                    else {
                        this.consume();
                    }
                    this.state = 542;
                    var la_ = this._interp.adaptivePredict(this._input,46,this._ctx);
                    if(la_===1) {
                        this.state = 541;
                        this.dateTimePrecisionSpecifier();

                    }
                    this.state = 544;
                    this.expression(5);
                    break;

                case 5:
                    localctx = new AndExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expression);
                    this.state = 545;
                    if (!( this.precpred(this._ctx, 3))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 3)");
                    }
                    this.state = 546;
                    this.match(cqlParser.T__54);
                    this.state = 547;
                    this.expression(4);
                    break;

                case 6:
                    localctx = new OrExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expression);
                    this.state = 548;
                    if (!( this.precpred(this._ctx, 2))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 2)");
                    }
                    this.state = 549;
                    _la = this._input.LA(1);
                    if(!(_la===cqlParser.T__62 || _la===cqlParser.T__63)) {
                    this._errHandler.recoverInline(this);
                    }
                    else {
                        this.consume();
                    }
                    this.state = 550;
                    this.expression(3);
                    break;

                case 7:
                    localctx = new InFixSetExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expression);
                    this.state = 551;
                    if (!( this.precpred(this._ctx, 1))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 1)");
                    }
                    this.state = 552;
                    _la = this._input.LA(1);
                    if(!(((((_la - 65)) & ~0x1f) == 0 && ((1 << (_la - 65)) & ((1 << (cqlParser.T__64 - 65)) | (1 << (cqlParser.T__65 - 65)) | (1 << (cqlParser.T__66 - 65)))) !== 0))) {
                    this._errHandler.recoverInline(this);
                    }
                    else {
                        this.consume();
                    }
                    this.state = 553;
                    this.expression(2);
                    break;

                case 8:
                    localctx = new BooleanExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expression);
                    this.state = 554;
                    if (!( this.precpred(this._ctx, 15))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 15)");
                    }
                    this.state = 555;
                    this.match(cqlParser.T__44);
                    this.state = 557;
                    _la = this._input.LA(1);
                    if(_la===cqlParser.T__45) {
                        this.state = 556;
                        this.match(cqlParser.T__45);
                    }

                    this.state = 559;
                    _la = this._input.LA(1);
                    if(!(((((_la - 47)) & ~0x1f) == 0 && ((1 << (_la - 47)) & ((1 << (cqlParser.T__46 - 47)) | (1 << (cqlParser.T__47 - 47)) | (1 << (cqlParser.T__48 - 47)))) !== 0))) {
                    this._errHandler.recoverInline(this);
                    }
                    else {
                        this.consume();
                    }
                    break;

                case 9:
                    localctx = new TypeExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expression);
                    this.state = 560;
                    if (!( this.precpred(this._ctx, 14))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 14)");
                    }
                    this.state = 561;
                    _la = this._input.LA(1);
                    if(!(_la===cqlParser.T__44 || _la===cqlParser.T__49)) {
                    this._errHandler.recoverInline(this);
                    }
                    else {
                        this.consume();
                    }
                    this.state = 562;
                    this.typeSpecifier();
                    break;

                case 10:
                    localctx = new BetweenExpressionContext(this, new ExpressionContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expression);
                    this.state = 563;
                    if (!( this.precpred(this._ctx, 10))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 10)");
                    }
                    this.state = 565;
                    _la = this._input.LA(1);
                    if(_la===cqlParser.T__52) {
                        this.state = 564;
                        this.match(cqlParser.T__52);
                    }

                    this.state = 567;
                    this.match(cqlParser.T__53);
                    this.state = 568;
                    this.expressionTerm(0);
                    this.state = 569;
                    this.match(cqlParser.T__54);
                    this.state = 570;
                    this.expressionTerm(0);
                    break;

                } 
            }
            this.state = 576;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input,50,this._ctx);
        }

    } catch( error) {
        if(error instanceof antlr4.error.RecognitionException) {
	        localctx.exception = error;
	        this._errHandler.reportError(this, error);
	        this._errHandler.recover(this, error);
	    } else {
	    	throw error;
	    }
    } finally {
        this.unrollRecursionContexts(_parentctx)
    }
    return localctx;
};

function DateTimePrecisionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_dateTimePrecision;
    return this;
}

DateTimePrecisionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
DateTimePrecisionContext.prototype.constructor = DateTimePrecisionContext;


DateTimePrecisionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterDateTimePrecision(this);
	}
};

DateTimePrecisionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitDateTimePrecision(this);
	}
};




cqlParser.DateTimePrecisionContext = DateTimePrecisionContext;

cqlParser.prototype.dateTimePrecision = function() {

    var localctx = new DateTimePrecisionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 102, cqlParser.RULE_dateTimePrecision);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 577;
        _la = this._input.LA(1);
        if(!(((((_la - 68)) & ~0x1f) == 0 && ((1 << (_la - 68)) & ((1 << (cqlParser.T__67 - 68)) | (1 << (cqlParser.T__68 - 68)) | (1 << (cqlParser.T__69 - 68)) | (1 << (cqlParser.T__70 - 68)) | (1 << (cqlParser.T__71 - 68)) | (1 << (cqlParser.T__72 - 68)) | (1 << (cqlParser.T__73 - 68)))) !== 0))) {
        this._errHandler.recoverInline(this);
        }
        else {
            this.consume();
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function DateTimeComponentContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_dateTimeComponent;
    return this;
}

DateTimeComponentContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
DateTimeComponentContext.prototype.constructor = DateTimeComponentContext;

DateTimeComponentContext.prototype.dateTimePrecision = function() {
    return this.getTypedRuleContext(DateTimePrecisionContext,0);
};

DateTimeComponentContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterDateTimeComponent(this);
	}
};

DateTimeComponentContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitDateTimeComponent(this);
	}
};




cqlParser.DateTimeComponentContext = DateTimeComponentContext;

cqlParser.prototype.dateTimeComponent = function() {

    var localctx = new DateTimeComponentContext(this, this._ctx, this.state);
    this.enterRule(localctx, 104, cqlParser.RULE_dateTimeComponent);
    try {
        this.state = 583;
        switch(this._input.LA(1)) {
        case cqlParser.T__67:
        case cqlParser.T__68:
        case cqlParser.T__69:
        case cqlParser.T__70:
        case cqlParser.T__71:
        case cqlParser.T__72:
        case cqlParser.T__73:
            this.enterOuterAlt(localctx, 1);
            this.state = 579;
            this.dateTimePrecision();
            break;
        case cqlParser.T__74:
            this.enterOuterAlt(localctx, 2);
            this.state = 580;
            this.match(cqlParser.T__74);
            break;
        case cqlParser.T__75:
            this.enterOuterAlt(localctx, 3);
            this.state = 581;
            this.match(cqlParser.T__75);
            break;
        case cqlParser.T__76:
            this.enterOuterAlt(localctx, 4);
            this.state = 582;
            this.match(cqlParser.T__76);
            break;
        default:
            throw new antlr4.error.NoViableAltException(this);
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function PluralDateTimePrecisionContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_pluralDateTimePrecision;
    return this;
}

PluralDateTimePrecisionContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
PluralDateTimePrecisionContext.prototype.constructor = PluralDateTimePrecisionContext;


PluralDateTimePrecisionContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterPluralDateTimePrecision(this);
	}
};

PluralDateTimePrecisionContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitPluralDateTimePrecision(this);
	}
};




cqlParser.PluralDateTimePrecisionContext = PluralDateTimePrecisionContext;

cqlParser.prototype.pluralDateTimePrecision = function() {

    var localctx = new PluralDateTimePrecisionContext(this, this._ctx, this.state);
    this.enterRule(localctx, 106, cqlParser.RULE_pluralDateTimePrecision);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 585;
        _la = this._input.LA(1);
        if(!(((((_la - 78)) & ~0x1f) == 0 && ((1 << (_la - 78)) & ((1 << (cqlParser.T__77 - 78)) | (1 << (cqlParser.T__78 - 78)) | (1 << (cqlParser.T__79 - 78)) | (1 << (cqlParser.T__80 - 78)) | (1 << (cqlParser.T__81 - 78)) | (1 << (cqlParser.T__82 - 78)) | (1 << (cqlParser.T__83 - 78)))) !== 0))) {
        this._errHandler.recoverInline(this);
        }
        else {
            this.consume();
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ExpressionTermContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_expressionTerm;
    return this;
}

ExpressionTermContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ExpressionTermContext.prototype.constructor = ExpressionTermContext;


 
ExpressionTermContext.prototype.copyFrom = function(ctx) {
    antlr4.ParserRuleContext.prototype.copyFrom.call(this, ctx);
};

function AdditionExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

AdditionExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
AdditionExpressionTermContext.prototype.constructor = AdditionExpressionTermContext;

cqlParser.AdditionExpressionTermContext = AdditionExpressionTermContext;

AdditionExpressionTermContext.prototype.expressionTerm = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionTermContext);
    } else {
        return this.getTypedRuleContext(ExpressionTermContext,i);
    }
};
AdditionExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterAdditionExpressionTerm(this);
	}
};

AdditionExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitAdditionExpressionTerm(this);
	}
};


function IndexedExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

IndexedExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
IndexedExpressionTermContext.prototype.constructor = IndexedExpressionTermContext;

cqlParser.IndexedExpressionTermContext = IndexedExpressionTermContext;

IndexedExpressionTermContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};

IndexedExpressionTermContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};
IndexedExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterIndexedExpressionTerm(this);
	}
};

IndexedExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitIndexedExpressionTerm(this);
	}
};


function WidthExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

WidthExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
WidthExpressionTermContext.prototype.constructor = WidthExpressionTermContext;

cqlParser.WidthExpressionTermContext = WidthExpressionTermContext;

WidthExpressionTermContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};
WidthExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterWidthExpressionTerm(this);
	}
};

WidthExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitWidthExpressionTerm(this);
	}
};


function TimeUnitExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

TimeUnitExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
TimeUnitExpressionTermContext.prototype.constructor = TimeUnitExpressionTermContext;

cqlParser.TimeUnitExpressionTermContext = TimeUnitExpressionTermContext;

TimeUnitExpressionTermContext.prototype.dateTimeComponent = function() {
    return this.getTypedRuleContext(DateTimeComponentContext,0);
};

TimeUnitExpressionTermContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};
TimeUnitExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTimeUnitExpressionTerm(this);
	}
};

TimeUnitExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTimeUnitExpressionTerm(this);
	}
};


function IfThenElseExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

IfThenElseExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
IfThenElseExpressionTermContext.prototype.constructor = IfThenElseExpressionTermContext;

cqlParser.IfThenElseExpressionTermContext = IfThenElseExpressionTermContext;

IfThenElseExpressionTermContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};
IfThenElseExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterIfThenElseExpressionTerm(this);
	}
};

IfThenElseExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitIfThenElseExpressionTerm(this);
	}
};


function TimeBoundaryExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

TimeBoundaryExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
TimeBoundaryExpressionTermContext.prototype.constructor = TimeBoundaryExpressionTermContext;

cqlParser.TimeBoundaryExpressionTermContext = TimeBoundaryExpressionTermContext;

TimeBoundaryExpressionTermContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};
TimeBoundaryExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTimeBoundaryExpressionTerm(this);
	}
};

TimeBoundaryExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTimeBoundaryExpressionTerm(this);
	}
};


function ElementExtractorExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

ElementExtractorExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
ElementExtractorExpressionTermContext.prototype.constructor = ElementExtractorExpressionTermContext;

cqlParser.ElementExtractorExpressionTermContext = ElementExtractorExpressionTermContext;

ElementExtractorExpressionTermContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};
ElementExtractorExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterElementExtractorExpressionTerm(this);
	}
};

ElementExtractorExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitElementExtractorExpressionTerm(this);
	}
};


function ConversionExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

ConversionExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
ConversionExpressionTermContext.prototype.constructor = ConversionExpressionTermContext;

cqlParser.ConversionExpressionTermContext = ConversionExpressionTermContext;

ConversionExpressionTermContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

ConversionExpressionTermContext.prototype.typeSpecifier = function() {
    return this.getTypedRuleContext(TypeSpecifierContext,0);
};
ConversionExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterConversionExpressionTerm(this);
	}
};

ConversionExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitConversionExpressionTerm(this);
	}
};


function TypeExtentExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

TypeExtentExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
TypeExtentExpressionTermContext.prototype.constructor = TypeExtentExpressionTermContext;

cqlParser.TypeExtentExpressionTermContext = TypeExtentExpressionTermContext;

TypeExtentExpressionTermContext.prototype.namedTypeSpecifier = function() {
    return this.getTypedRuleContext(NamedTypeSpecifierContext,0);
};
TypeExtentExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTypeExtentExpressionTerm(this);
	}
};

TypeExtentExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTypeExtentExpressionTerm(this);
	}
};


function PredecessorExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

PredecessorExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
PredecessorExpressionTermContext.prototype.constructor = PredecessorExpressionTermContext;

cqlParser.PredecessorExpressionTermContext = PredecessorExpressionTermContext;

PredecessorExpressionTermContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};
PredecessorExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterPredecessorExpressionTerm(this);
	}
};

PredecessorExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitPredecessorExpressionTerm(this);
	}
};


function AccessorExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

AccessorExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
AccessorExpressionTermContext.prototype.constructor = AccessorExpressionTermContext;

cqlParser.AccessorExpressionTermContext = AccessorExpressionTermContext;

AccessorExpressionTermContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};

AccessorExpressionTermContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};
AccessorExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterAccessorExpressionTerm(this);
	}
};

AccessorExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitAccessorExpressionTerm(this);
	}
};


function MultiplicationExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

MultiplicationExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
MultiplicationExpressionTermContext.prototype.constructor = MultiplicationExpressionTermContext;

cqlParser.MultiplicationExpressionTermContext = MultiplicationExpressionTermContext;

MultiplicationExpressionTermContext.prototype.expressionTerm = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionTermContext);
    } else {
        return this.getTypedRuleContext(ExpressionTermContext,i);
    }
};
MultiplicationExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterMultiplicationExpressionTerm(this);
	}
};

MultiplicationExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitMultiplicationExpressionTerm(this);
	}
};


function AggregateExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

AggregateExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
AggregateExpressionTermContext.prototype.constructor = AggregateExpressionTermContext;

cqlParser.AggregateExpressionTermContext = AggregateExpressionTermContext;

AggregateExpressionTermContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};
AggregateExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterAggregateExpressionTerm(this);
	}
};

AggregateExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitAggregateExpressionTerm(this);
	}
};


function DurationExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

DurationExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
DurationExpressionTermContext.prototype.constructor = DurationExpressionTermContext;

cqlParser.DurationExpressionTermContext = DurationExpressionTermContext;

DurationExpressionTermContext.prototype.pluralDateTimePrecision = function() {
    return this.getTypedRuleContext(PluralDateTimePrecisionContext,0);
};

DurationExpressionTermContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};
DurationExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterDurationExpressionTerm(this);
	}
};

DurationExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitDurationExpressionTerm(this);
	}
};


function CaseExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

CaseExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
CaseExpressionTermContext.prototype.constructor = CaseExpressionTermContext;

cqlParser.CaseExpressionTermContext = CaseExpressionTermContext;

CaseExpressionTermContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};

CaseExpressionTermContext.prototype.caseExpressionItem = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(CaseExpressionItemContext);
    } else {
        return this.getTypedRuleContext(CaseExpressionItemContext,i);
    }
};
CaseExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterCaseExpressionTerm(this);
	}
};

CaseExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitCaseExpressionTerm(this);
	}
};


function PowerExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

PowerExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
PowerExpressionTermContext.prototype.constructor = PowerExpressionTermContext;

cqlParser.PowerExpressionTermContext = PowerExpressionTermContext;

PowerExpressionTermContext.prototype.expressionTerm = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionTermContext);
    } else {
        return this.getTypedRuleContext(ExpressionTermContext,i);
    }
};
PowerExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterPowerExpressionTerm(this);
	}
};

PowerExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitPowerExpressionTerm(this);
	}
};


function SuccessorExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

SuccessorExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
SuccessorExpressionTermContext.prototype.constructor = SuccessorExpressionTermContext;

cqlParser.SuccessorExpressionTermContext = SuccessorExpressionTermContext;

SuccessorExpressionTermContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};
SuccessorExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterSuccessorExpressionTerm(this);
	}
};

SuccessorExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitSuccessorExpressionTerm(this);
	}
};


function PolarityExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

PolarityExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
PolarityExpressionTermContext.prototype.constructor = PolarityExpressionTermContext;

cqlParser.PolarityExpressionTermContext = PolarityExpressionTermContext;

PolarityExpressionTermContext.prototype.expressionTerm = function() {
    return this.getTypedRuleContext(ExpressionTermContext,0);
};
PolarityExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterPolarityExpressionTerm(this);
	}
};

PolarityExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitPolarityExpressionTerm(this);
	}
};


function TermExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

TermExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
TermExpressionTermContext.prototype.constructor = TermExpressionTermContext;

cqlParser.TermExpressionTermContext = TermExpressionTermContext;

TermExpressionTermContext.prototype.term = function() {
    return this.getTypedRuleContext(TermContext,0);
};
TermExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTermExpressionTerm(this);
	}
};

TermExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTermExpressionTerm(this);
	}
};


function InvocationExpressionTermContext(parser, ctx) {
	ExpressionTermContext.call(this, parser);
    ExpressionTermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

InvocationExpressionTermContext.prototype = Object.create(ExpressionTermContext.prototype);
InvocationExpressionTermContext.prototype.constructor = InvocationExpressionTermContext;

cqlParser.InvocationExpressionTermContext = InvocationExpressionTermContext;

InvocationExpressionTermContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

InvocationExpressionTermContext.prototype.qualifier = function() {
    return this.getTypedRuleContext(QualifierContext,0);
};

InvocationExpressionTermContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};
InvocationExpressionTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterInvocationExpressionTerm(this);
	}
};

InvocationExpressionTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitInvocationExpressionTerm(this);
	}
};



cqlParser.prototype.expressionTerm = function(_p) {
	if(_p===undefined) {
	    _p = 0;
	}
    var _parentctx = this._ctx;
    var _parentState = this.state;
    var localctx = new ExpressionTermContext(this, this._ctx, _parentState);
    var _prevctx = localctx;
    var _startState = 108;
    this.enterRecursionRule(localctx, 108, cqlParser.RULE_expressionTerm, _p);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 664;
        var la_ = this._interp.adaptivePredict(this._input,57,this._ctx);
        switch(la_) {
        case 1:
            localctx = new PolarityExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;

            this.state = 588;
            _la = this._input.LA(1);
            if(!(_la===cqlParser.T__86 || _la===cqlParser.T__87)) {
            this._errHandler.recoverInline(this);
            }
            else {
                this.consume();
            }
            this.state = 589;
            this.expressionTerm(15);
            break;

        case 2:
            localctx = new TimeBoundaryExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 590;
            _la = this._input.LA(1);
            if(!(_la===cqlParser.T__88 || _la===cqlParser.T__89)) {
            this._errHandler.recoverInline(this);
            }
            else {
                this.consume();
            }
            this.state = 591;
            this.match(cqlParser.T__90);
            this.state = 592;
            this.expressionTerm(14);
            break;

        case 3:
            localctx = new TimeUnitExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 593;
            this.dateTimeComponent();
            this.state = 594;
            this.match(cqlParser.T__33);
            this.state = 595;
            this.expressionTerm(13);
            break;

        case 4:
            localctx = new DurationExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 597;
            this.match(cqlParser.T__91);
            this.state = 598;
            this.match(cqlParser.T__31);
            this.state = 599;
            this.pluralDateTimePrecision();
            this.state = 600;
            this.match(cqlParser.T__90);
            this.state = 601;
            this.expressionTerm(12);
            break;

        case 5:
            localctx = new WidthExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 603;
            this.match(cqlParser.T__92);
            this.state = 604;
            this.match(cqlParser.T__90);
            this.state = 605;
            this.expressionTerm(11);
            break;

        case 6:
            localctx = new SuccessorExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 606;
            this.match(cqlParser.T__93);
            this.state = 607;
            this.match(cqlParser.T__90);
            this.state = 608;
            this.expressionTerm(10);
            break;

        case 7:
            localctx = new PredecessorExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 609;
            this.match(cqlParser.T__94);
            this.state = 610;
            this.match(cqlParser.T__90);
            this.state = 611;
            this.expressionTerm(9);
            break;

        case 8:
            localctx = new ElementExtractorExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 612;
            this.match(cqlParser.T__95);
            this.state = 613;
            this.match(cqlParser.T__33);
            this.state = 614;
            this.expressionTerm(8);
            break;

        case 9:
            localctx = new TermExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 615;
            this.term();
            break;

        case 10:
            localctx = new InvocationExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 619;
            var la_ = this._interp.adaptivePredict(this._input,52,this._ctx);
            if(la_===1) {
                this.state = 616;
                this.qualifier();
                this.state = 617;
                this.match(cqlParser.T__16);

            }
            this.state = 621;
            this.identifier();
            this.state = 622;
            this.match(cqlParser.T__13);
            this.state = 631;
            _la = this._input.LA(1);
            if((((_la) & ~0x1f) == 0 && ((1 << _la) & ((1 << cqlParser.T__1) | (1 << cqlParser.T__13) | (1 << cqlParser.T__17) | (1 << cqlParser.T__20) | (1 << cqlParser.T__21) | (1 << cqlParser.T__22) | (1 << cqlParser.T__30))) !== 0) || ((((_la - 34)) & ~0x1f) == 0 && ((1 << (_la - 34)) & ((1 << (cqlParser.T__33 - 34)) | (1 << (cqlParser.T__37 - 34)) | (1 << (cqlParser.T__45 - 34)) | (1 << (cqlParser.T__46 - 34)) | (1 << (cqlParser.T__47 - 34)) | (1 << (cqlParser.T__48 - 34)) | (1 << (cqlParser.T__50 - 34)) | (1 << (cqlParser.T__51 - 34)) | (1 << (cqlParser.T__55 - 34)))) !== 0) || ((((_la - 68)) & ~0x1f) == 0 && ((1 << (_la - 68)) & ((1 << (cqlParser.T__67 - 68)) | (1 << (cqlParser.T__68 - 68)) | (1 << (cqlParser.T__69 - 68)) | (1 << (cqlParser.T__70 - 68)) | (1 << (cqlParser.T__71 - 68)) | (1 << (cqlParser.T__72 - 68)) | (1 << (cqlParser.T__73 - 68)) | (1 << (cqlParser.T__74 - 68)) | (1 << (cqlParser.T__75 - 68)) | (1 << (cqlParser.T__76 - 68)) | (1 << (cqlParser.T__77 - 68)) | (1 << (cqlParser.T__78 - 68)) | (1 << (cqlParser.T__79 - 68)) | (1 << (cqlParser.T__80 - 68)) | (1 << (cqlParser.T__81 - 68)) | (1 << (cqlParser.T__82 - 68)) | (1 << (cqlParser.T__83 - 68)) | (1 << (cqlParser.T__84 - 68)) | (1 << (cqlParser.T__86 - 68)) | (1 << (cqlParser.T__87 - 68)) | (1 << (cqlParser.T__88 - 68)) | (1 << (cqlParser.T__89 - 68)) | (1 << (cqlParser.T__91 - 68)) | (1 << (cqlParser.T__92 - 68)) | (1 << (cqlParser.T__93 - 68)) | (1 << (cqlParser.T__94 - 68)) | (1 << (cqlParser.T__95 - 68)) | (1 << (cqlParser.T__96 - 68)) | (1 << (cqlParser.T__97 - 68)))) !== 0) || ((((_la - 104)) & ~0x1f) == 0 && ((1 << (_la - 104)) & ((1 << (cqlParser.T__103 - 104)) | (1 << (cqlParser.T__106 - 104)) | (1 << (cqlParser.T__107 - 104)) | (1 << (cqlParser.T__108 - 104)) | (1 << (cqlParser.T__126 - 104)) | (1 << (cqlParser.T__127 - 104)) | (1 << (cqlParser.T__128 - 104)) | (1 << (cqlParser.IDENTIFIER - 104)) | (1 << (cqlParser.QUANTITY - 104)) | (1 << (cqlParser.DATETIME - 104)) | (1 << (cqlParser.TIME - 104)) | (1 << (cqlParser.QUOTEDIDENTIFIER - 104)) | (1 << (cqlParser.STRING - 104)))) !== 0)) {
                this.state = 623;
                this.expression(0);
                this.state = 628;
                this._errHandler.sync(this);
                _la = this._input.LA(1);
                while(_la===cqlParser.T__14) {
                    this.state = 624;
                    this.match(cqlParser.T__14);
                    this.state = 625;
                    this.expression(0);
                    this.state = 630;
                    this._errHandler.sync(this);
                    _la = this._input.LA(1);
                }
            }

            this.state = 633;
            this.match(cqlParser.T__15);
            break;

        case 11:
            localctx = new ConversionExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 635;
            this.match(cqlParser.T__84);
            this.state = 636;
            this.expression(0);
            this.state = 637;
            this.match(cqlParser.T__85);
            this.state = 638;
            this.typeSpecifier();
            break;

        case 12:
            localctx = new TypeExtentExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 640;
            _la = this._input.LA(1);
            if(!(_la===cqlParser.T__96 || _la===cqlParser.T__97)) {
            this._errHandler.recoverInline(this);
            }
            else {
                this.consume();
            }
            this.state = 641;
            this.namedTypeSpecifier();
            break;

        case 13:
            localctx = new IfThenElseExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 642;
            this.match(cqlParser.T__103);
            this.state = 643;
            this.expression(0);
            this.state = 644;
            this.match(cqlParser.T__104);
            this.state = 645;
            this.expression(0);
            this.state = 646;
            this.match(cqlParser.T__105);
            this.state = 647;
            this.expression(0);
            break;

        case 14:
            localctx = new CaseExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 649;
            this.match(cqlParser.T__106);
            this.state = 651;
            _la = this._input.LA(1);
            if((((_la) & ~0x1f) == 0 && ((1 << _la) & ((1 << cqlParser.T__1) | (1 << cqlParser.T__13) | (1 << cqlParser.T__17) | (1 << cqlParser.T__20) | (1 << cqlParser.T__21) | (1 << cqlParser.T__22) | (1 << cqlParser.T__30))) !== 0) || ((((_la - 34)) & ~0x1f) == 0 && ((1 << (_la - 34)) & ((1 << (cqlParser.T__33 - 34)) | (1 << (cqlParser.T__37 - 34)) | (1 << (cqlParser.T__45 - 34)) | (1 << (cqlParser.T__46 - 34)) | (1 << (cqlParser.T__47 - 34)) | (1 << (cqlParser.T__48 - 34)) | (1 << (cqlParser.T__50 - 34)) | (1 << (cqlParser.T__51 - 34)) | (1 << (cqlParser.T__55 - 34)))) !== 0) || ((((_la - 68)) & ~0x1f) == 0 && ((1 << (_la - 68)) & ((1 << (cqlParser.T__67 - 68)) | (1 << (cqlParser.T__68 - 68)) | (1 << (cqlParser.T__69 - 68)) | (1 << (cqlParser.T__70 - 68)) | (1 << (cqlParser.T__71 - 68)) | (1 << (cqlParser.T__72 - 68)) | (1 << (cqlParser.T__73 - 68)) | (1 << (cqlParser.T__74 - 68)) | (1 << (cqlParser.T__75 - 68)) | (1 << (cqlParser.T__76 - 68)) | (1 << (cqlParser.T__77 - 68)) | (1 << (cqlParser.T__78 - 68)) | (1 << (cqlParser.T__79 - 68)) | (1 << (cqlParser.T__80 - 68)) | (1 << (cqlParser.T__81 - 68)) | (1 << (cqlParser.T__82 - 68)) | (1 << (cqlParser.T__83 - 68)) | (1 << (cqlParser.T__84 - 68)) | (1 << (cqlParser.T__86 - 68)) | (1 << (cqlParser.T__87 - 68)) | (1 << (cqlParser.T__88 - 68)) | (1 << (cqlParser.T__89 - 68)) | (1 << (cqlParser.T__91 - 68)) | (1 << (cqlParser.T__92 - 68)) | (1 << (cqlParser.T__93 - 68)) | (1 << (cqlParser.T__94 - 68)) | (1 << (cqlParser.T__95 - 68)) | (1 << (cqlParser.T__96 - 68)) | (1 << (cqlParser.T__97 - 68)))) !== 0) || ((((_la - 104)) & ~0x1f) == 0 && ((1 << (_la - 104)) & ((1 << (cqlParser.T__103 - 104)) | (1 << (cqlParser.T__106 - 104)) | (1 << (cqlParser.T__107 - 104)) | (1 << (cqlParser.T__108 - 104)) | (1 << (cqlParser.T__126 - 104)) | (1 << (cqlParser.T__127 - 104)) | (1 << (cqlParser.T__128 - 104)) | (1 << (cqlParser.IDENTIFIER - 104)) | (1 << (cqlParser.QUANTITY - 104)) | (1 << (cqlParser.DATETIME - 104)) | (1 << (cqlParser.TIME - 104)) | (1 << (cqlParser.QUOTEDIDENTIFIER - 104)) | (1 << (cqlParser.STRING - 104)))) !== 0)) {
                this.state = 650;
                this.expression(0);
            }

            this.state = 654; 
            this._errHandler.sync(this);
            _la = this._input.LA(1);
            do {
                this.state = 653;
                this.caseExpressionItem();
                this.state = 656; 
                this._errHandler.sync(this);
                _la = this._input.LA(1);
            } while(_la===cqlParser.T__109);
            this.state = 658;
            this.match(cqlParser.T__105);
            this.state = 659;
            this.expression(0);
            this.state = 660;
            this.match(cqlParser.T__89);
            break;

        case 15:
            localctx = new AggregateExpressionTermContext(this, localctx);
            this._ctx = localctx;
            _prevctx = localctx;
            this.state = 662;
            _la = this._input.LA(1);
            if(!(_la===cqlParser.T__37 || _la===cqlParser.T__107 || _la===cqlParser.T__108)) {
            this._errHandler.recoverInline(this);
            }
            else {
                this.consume();
            }
            this.state = 663;
            this.expression(0);
            break;

        }
        this._ctx.stop = this._input.LT(-1);
        this.state = 685;
        this._errHandler.sync(this);
        var _alt = this._interp.adaptivePredict(this._input,59,this._ctx)
        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
            if(_alt===1) {
                if(this._parseListeners!==null) {
                    this.triggerExitRuleEvent();
                }
                _prevctx = localctx;
                this.state = 683;
                var la_ = this._interp.adaptivePredict(this._input,58,this._ctx);
                switch(la_) {
                case 1:
                    localctx = new PowerExpressionTermContext(this, new ExpressionTermContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expressionTerm);
                    this.state = 666;
                    if (!( this.precpred(this._ctx, 6))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 6)");
                    }
                    this.state = 667;
                    this.match(cqlParser.T__98);
                    this.state = 668;
                    this.expressionTerm(7);
                    break;

                case 2:
                    localctx = new MultiplicationExpressionTermContext(this, new ExpressionTermContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expressionTerm);
                    this.state = 669;
                    if (!( this.precpred(this._ctx, 5))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 5)");
                    }
                    this.state = 670;
                    _la = this._input.LA(1);
                    if(!(((((_la - 100)) & ~0x1f) == 0 && ((1 << (_la - 100)) & ((1 << (cqlParser.T__99 - 100)) | (1 << (cqlParser.T__100 - 100)) | (1 << (cqlParser.T__101 - 100)) | (1 << (cqlParser.T__102 - 100)))) !== 0))) {
                    this._errHandler.recoverInline(this);
                    }
                    else {
                        this.consume();
                    }
                    this.state = 671;
                    this.expressionTerm(6);
                    break;

                case 3:
                    localctx = new AdditionExpressionTermContext(this, new ExpressionTermContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expressionTerm);
                    this.state = 672;
                    if (!( this.precpred(this._ctx, 4))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 4)");
                    }
                    this.state = 673;
                    _la = this._input.LA(1);
                    if(!(_la===cqlParser.T__86 || _la===cqlParser.T__87)) {
                    this._errHandler.recoverInline(this);
                    }
                    else {
                        this.consume();
                    }
                    this.state = 674;
                    this.expressionTerm(5);
                    break;

                case 4:
                    localctx = new AccessorExpressionTermContext(this, new ExpressionTermContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expressionTerm);
                    this.state = 675;
                    if (!( this.precpred(this._ctx, 19))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 19)");
                    }
                    this.state = 676;
                    this.match(cqlParser.T__16);
                    this.state = 677;
                    this.identifier();
                    break;

                case 5:
                    localctx = new IndexedExpressionTermContext(this, new ExpressionTermContext(this, _parentctx, _parentState));
                    this.pushNewRecursionContext(localctx, _startState, cqlParser.RULE_expressionTerm);
                    this.state = 678;
                    if (!( this.precpred(this._ctx, 18))) {
                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 18)");
                    }
                    this.state = 679;
                    this.match(cqlParser.T__30);
                    this.state = 680;
                    this.expression(0);
                    this.state = 681;
                    this.match(cqlParser.T__32);
                    break;

                } 
            }
            this.state = 687;
            this._errHandler.sync(this);
            _alt = this._interp.adaptivePredict(this._input,59,this._ctx);
        }

    } catch( error) {
        if(error instanceof antlr4.error.RecognitionException) {
	        localctx.exception = error;
	        this._errHandler.reportError(this, error);
	        this._errHandler.recover(this, error);
	    } else {
	    	throw error;
	    }
    } finally {
        this.unrollRecursionContexts(_parentctx)
    }
    return localctx;
};

function CaseExpressionItemContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_caseExpressionItem;
    return this;
}

CaseExpressionItemContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
CaseExpressionItemContext.prototype.constructor = CaseExpressionItemContext;

CaseExpressionItemContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};

CaseExpressionItemContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterCaseExpressionItem(this);
	}
};

CaseExpressionItemContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitCaseExpressionItem(this);
	}
};




cqlParser.CaseExpressionItemContext = CaseExpressionItemContext;

cqlParser.prototype.caseExpressionItem = function() {

    var localctx = new CaseExpressionItemContext(this, this._ctx, this.state);
    this.enterRule(localctx, 110, cqlParser.RULE_caseExpressionItem);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 688;
        this.match(cqlParser.T__109);
        this.state = 689;
        this.expression(0);
        this.state = 690;
        this.match(cqlParser.T__104);
        this.state = 691;
        this.expression(0);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function DateTimePrecisionSpecifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_dateTimePrecisionSpecifier;
    return this;
}

DateTimePrecisionSpecifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
DateTimePrecisionSpecifierContext.prototype.constructor = DateTimePrecisionSpecifierContext;

DateTimePrecisionSpecifierContext.prototype.dateTimePrecision = function() {
    return this.getTypedRuleContext(DateTimePrecisionContext,0);
};

DateTimePrecisionSpecifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterDateTimePrecisionSpecifier(this);
	}
};

DateTimePrecisionSpecifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitDateTimePrecisionSpecifier(this);
	}
};




cqlParser.DateTimePrecisionSpecifierContext = DateTimePrecisionSpecifierContext;

cqlParser.prototype.dateTimePrecisionSpecifier = function() {

    var localctx = new DateTimePrecisionSpecifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 112, cqlParser.RULE_dateTimePrecisionSpecifier);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 693;
        this.dateTimePrecision();
        this.state = 694;
        this.match(cqlParser.T__90);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function RelativeQualifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_relativeQualifier;
    return this;
}

RelativeQualifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
RelativeQualifierContext.prototype.constructor = RelativeQualifierContext;


RelativeQualifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterRelativeQualifier(this);
	}
};

RelativeQualifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitRelativeQualifier(this);
	}
};




cqlParser.RelativeQualifierContext = RelativeQualifierContext;

cqlParser.prototype.relativeQualifier = function() {

    var localctx = new RelativeQualifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 114, cqlParser.RULE_relativeQualifier);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 696;
        _la = this._input.LA(1);
        if(!(_la===cqlParser.T__110 || _la===cqlParser.T__111)) {
        this._errHandler.recoverInline(this);
        }
        else {
            this.consume();
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function OffsetRelativeQualifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_offsetRelativeQualifier;
    return this;
}

OffsetRelativeQualifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
OffsetRelativeQualifierContext.prototype.constructor = OffsetRelativeQualifierContext;


OffsetRelativeQualifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterOffsetRelativeQualifier(this);
	}
};

OffsetRelativeQualifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitOffsetRelativeQualifier(this);
	}
};




cqlParser.OffsetRelativeQualifierContext = OffsetRelativeQualifierContext;

cqlParser.prototype.offsetRelativeQualifier = function() {

    var localctx = new OffsetRelativeQualifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 116, cqlParser.RULE_offsetRelativeQualifier);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 698;
        _la = this._input.LA(1);
        if(!(_la===cqlParser.T__112 || _la===cqlParser.T__113)) {
        this._errHandler.recoverInline(this);
        }
        else {
            this.consume();
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function QuantityOffsetContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_quantityOffset;
    return this;
}

QuantityOffsetContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
QuantityOffsetContext.prototype.constructor = QuantityOffsetContext;

QuantityOffsetContext.prototype.quantityLiteral = function() {
    return this.getTypedRuleContext(QuantityLiteralContext,0);
};

QuantityOffsetContext.prototype.offsetRelativeQualifier = function() {
    return this.getTypedRuleContext(OffsetRelativeQualifierContext,0);
};

QuantityOffsetContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterQuantityOffset(this);
	}
};

QuantityOffsetContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitQuantityOffset(this);
	}
};




cqlParser.QuantityOffsetContext = QuantityOffsetContext;

cqlParser.prototype.quantityOffset = function() {

    var localctx = new QuantityOffsetContext(this, this._ctx, this.state);
    this.enterRule(localctx, 118, cqlParser.RULE_quantityOffset);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 700;
        this.quantityLiteral();
        this.state = 702;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__112 || _la===cqlParser.T__113) {
            this.state = 701;
            this.offsetRelativeQualifier();
        }

    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function IntervalOperatorPhraseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_intervalOperatorPhrase;
    return this;
}

IntervalOperatorPhraseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
IntervalOperatorPhraseContext.prototype.constructor = IntervalOperatorPhraseContext;


 
IntervalOperatorPhraseContext.prototype.copyFrom = function(ctx) {
    antlr4.ParserRuleContext.prototype.copyFrom.call(this, ctx);
};


function WithinIntervalOperatorPhraseContext(parser, ctx) {
	IntervalOperatorPhraseContext.call(this, parser);
    IntervalOperatorPhraseContext.prototype.copyFrom.call(this, ctx);
    return this;
}

WithinIntervalOperatorPhraseContext.prototype = Object.create(IntervalOperatorPhraseContext.prototype);
WithinIntervalOperatorPhraseContext.prototype.constructor = WithinIntervalOperatorPhraseContext;

cqlParser.WithinIntervalOperatorPhraseContext = WithinIntervalOperatorPhraseContext;

WithinIntervalOperatorPhraseContext.prototype.quantityLiteral = function() {
    return this.getTypedRuleContext(QuantityLiteralContext,0);
};
WithinIntervalOperatorPhraseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterWithinIntervalOperatorPhrase(this);
	}
};

WithinIntervalOperatorPhraseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitWithinIntervalOperatorPhrase(this);
	}
};


function IncludedInIntervalOperatorPhraseContext(parser, ctx) {
	IntervalOperatorPhraseContext.call(this, parser);
    IntervalOperatorPhraseContext.prototype.copyFrom.call(this, ctx);
    return this;
}

IncludedInIntervalOperatorPhraseContext.prototype = Object.create(IntervalOperatorPhraseContext.prototype);
IncludedInIntervalOperatorPhraseContext.prototype.constructor = IncludedInIntervalOperatorPhraseContext;

cqlParser.IncludedInIntervalOperatorPhraseContext = IncludedInIntervalOperatorPhraseContext;

IncludedInIntervalOperatorPhraseContext.prototype.dateTimePrecisionSpecifier = function() {
    return this.getTypedRuleContext(DateTimePrecisionSpecifierContext,0);
};
IncludedInIntervalOperatorPhraseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterIncludedInIntervalOperatorPhrase(this);
	}
};

IncludedInIntervalOperatorPhraseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitIncludedInIntervalOperatorPhrase(this);
	}
};


function EndsIntervalOperatorPhraseContext(parser, ctx) {
	IntervalOperatorPhraseContext.call(this, parser);
    IntervalOperatorPhraseContext.prototype.copyFrom.call(this, ctx);
    return this;
}

EndsIntervalOperatorPhraseContext.prototype = Object.create(IntervalOperatorPhraseContext.prototype);
EndsIntervalOperatorPhraseContext.prototype.constructor = EndsIntervalOperatorPhraseContext;

cqlParser.EndsIntervalOperatorPhraseContext = EndsIntervalOperatorPhraseContext;

EndsIntervalOperatorPhraseContext.prototype.dateTimePrecisionSpecifier = function() {
    return this.getTypedRuleContext(DateTimePrecisionSpecifierContext,0);
};
EndsIntervalOperatorPhraseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterEndsIntervalOperatorPhrase(this);
	}
};

EndsIntervalOperatorPhraseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitEndsIntervalOperatorPhrase(this);
	}
};


function ConcurrentWithIntervalOperatorPhraseContext(parser, ctx) {
	IntervalOperatorPhraseContext.call(this, parser);
    IntervalOperatorPhraseContext.prototype.copyFrom.call(this, ctx);
    return this;
}

ConcurrentWithIntervalOperatorPhraseContext.prototype = Object.create(IntervalOperatorPhraseContext.prototype);
ConcurrentWithIntervalOperatorPhraseContext.prototype.constructor = ConcurrentWithIntervalOperatorPhraseContext;

cqlParser.ConcurrentWithIntervalOperatorPhraseContext = ConcurrentWithIntervalOperatorPhraseContext;

ConcurrentWithIntervalOperatorPhraseContext.prototype.relativeQualifier = function() {
    return this.getTypedRuleContext(RelativeQualifierContext,0);
};

ConcurrentWithIntervalOperatorPhraseContext.prototype.dateTimePrecision = function() {
    return this.getTypedRuleContext(DateTimePrecisionContext,0);
};
ConcurrentWithIntervalOperatorPhraseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterConcurrentWithIntervalOperatorPhrase(this);
	}
};

ConcurrentWithIntervalOperatorPhraseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitConcurrentWithIntervalOperatorPhrase(this);
	}
};


function OverlapsIntervalOperatorPhraseContext(parser, ctx) {
	IntervalOperatorPhraseContext.call(this, parser);
    IntervalOperatorPhraseContext.prototype.copyFrom.call(this, ctx);
    return this;
}

OverlapsIntervalOperatorPhraseContext.prototype = Object.create(IntervalOperatorPhraseContext.prototype);
OverlapsIntervalOperatorPhraseContext.prototype.constructor = OverlapsIntervalOperatorPhraseContext;

cqlParser.OverlapsIntervalOperatorPhraseContext = OverlapsIntervalOperatorPhraseContext;

OverlapsIntervalOperatorPhraseContext.prototype.dateTimePrecisionSpecifier = function() {
    return this.getTypedRuleContext(DateTimePrecisionSpecifierContext,0);
};
OverlapsIntervalOperatorPhraseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterOverlapsIntervalOperatorPhrase(this);
	}
};

OverlapsIntervalOperatorPhraseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitOverlapsIntervalOperatorPhrase(this);
	}
};


function IncludesIntervalOperatorPhraseContext(parser, ctx) {
	IntervalOperatorPhraseContext.call(this, parser);
    IntervalOperatorPhraseContext.prototype.copyFrom.call(this, ctx);
    return this;
}

IncludesIntervalOperatorPhraseContext.prototype = Object.create(IntervalOperatorPhraseContext.prototype);
IncludesIntervalOperatorPhraseContext.prototype.constructor = IncludesIntervalOperatorPhraseContext;

cqlParser.IncludesIntervalOperatorPhraseContext = IncludesIntervalOperatorPhraseContext;

IncludesIntervalOperatorPhraseContext.prototype.dateTimePrecisionSpecifier = function() {
    return this.getTypedRuleContext(DateTimePrecisionSpecifierContext,0);
};
IncludesIntervalOperatorPhraseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterIncludesIntervalOperatorPhrase(this);
	}
};

IncludesIntervalOperatorPhraseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitIncludesIntervalOperatorPhrase(this);
	}
};


function BeforeOrAfterIntervalOperatorPhraseContext(parser, ctx) {
	IntervalOperatorPhraseContext.call(this, parser);
    IntervalOperatorPhraseContext.prototype.copyFrom.call(this, ctx);
    return this;
}

BeforeOrAfterIntervalOperatorPhraseContext.prototype = Object.create(IntervalOperatorPhraseContext.prototype);
BeforeOrAfterIntervalOperatorPhraseContext.prototype.constructor = BeforeOrAfterIntervalOperatorPhraseContext;

cqlParser.BeforeOrAfterIntervalOperatorPhraseContext = BeforeOrAfterIntervalOperatorPhraseContext;

BeforeOrAfterIntervalOperatorPhraseContext.prototype.quantityOffset = function() {
    return this.getTypedRuleContext(QuantityOffsetContext,0);
};

BeforeOrAfterIntervalOperatorPhraseContext.prototype.dateTimePrecisionSpecifier = function() {
    return this.getTypedRuleContext(DateTimePrecisionSpecifierContext,0);
};
BeforeOrAfterIntervalOperatorPhraseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterBeforeOrAfterIntervalOperatorPhrase(this);
	}
};

BeforeOrAfterIntervalOperatorPhraseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitBeforeOrAfterIntervalOperatorPhrase(this);
	}
};


function MeetsIntervalOperatorPhraseContext(parser, ctx) {
	IntervalOperatorPhraseContext.call(this, parser);
    IntervalOperatorPhraseContext.prototype.copyFrom.call(this, ctx);
    return this;
}

MeetsIntervalOperatorPhraseContext.prototype = Object.create(IntervalOperatorPhraseContext.prototype);
MeetsIntervalOperatorPhraseContext.prototype.constructor = MeetsIntervalOperatorPhraseContext;

cqlParser.MeetsIntervalOperatorPhraseContext = MeetsIntervalOperatorPhraseContext;

MeetsIntervalOperatorPhraseContext.prototype.dateTimePrecisionSpecifier = function() {
    return this.getTypedRuleContext(DateTimePrecisionSpecifierContext,0);
};
MeetsIntervalOperatorPhraseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterMeetsIntervalOperatorPhrase(this);
	}
};

MeetsIntervalOperatorPhraseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitMeetsIntervalOperatorPhrase(this);
	}
};


function StartsIntervalOperatorPhraseContext(parser, ctx) {
	IntervalOperatorPhraseContext.call(this, parser);
    IntervalOperatorPhraseContext.prototype.copyFrom.call(this, ctx);
    return this;
}

StartsIntervalOperatorPhraseContext.prototype = Object.create(IntervalOperatorPhraseContext.prototype);
StartsIntervalOperatorPhraseContext.prototype.constructor = StartsIntervalOperatorPhraseContext;

cqlParser.StartsIntervalOperatorPhraseContext = StartsIntervalOperatorPhraseContext;

StartsIntervalOperatorPhraseContext.prototype.dateTimePrecisionSpecifier = function() {
    return this.getTypedRuleContext(DateTimePrecisionSpecifierContext,0);
};
StartsIntervalOperatorPhraseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterStartsIntervalOperatorPhrase(this);
	}
};

StartsIntervalOperatorPhraseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitStartsIntervalOperatorPhrase(this);
	}
};



cqlParser.IntervalOperatorPhraseContext = IntervalOperatorPhraseContext;

cqlParser.prototype.intervalOperatorPhrase = function() {

    var localctx = new IntervalOperatorPhraseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 120, cqlParser.RULE_intervalOperatorPhrase);
    var _la = 0; // Token type
    try {
        this.state = 785;
        var la_ = this._interp.adaptivePredict(this._input,84,this._ctx);
        switch(la_) {
        case 1:
            localctx = new ConcurrentWithIntervalOperatorPhraseContext(this, localctx);
            this.enterOuterAlt(localctx, 1);
            this.state = 705;
            _la = this._input.LA(1);
            if(((((_la - 115)) & ~0x1f) == 0 && ((1 << (_la - 115)) & ((1 << (cqlParser.T__114 - 115)) | (1 << (cqlParser.T__115 - 115)) | (1 << (cqlParser.T__116 - 115)))) !== 0)) {
                this.state = 704;
                _la = this._input.LA(1);
                if(!(((((_la - 115)) & ~0x1f) == 0 && ((1 << (_la - 115)) & ((1 << (cqlParser.T__114 - 115)) | (1 << (cqlParser.T__115 - 115)) | (1 << (cqlParser.T__116 - 115)))) !== 0))) {
                this._errHandler.recoverInline(this);
                }
                else {
                    this.consume();
                }
            }

            this.state = 707;
            this.match(cqlParser.T__117);
            this.state = 709;
            _la = this._input.LA(1);
            if(((((_la - 68)) & ~0x1f) == 0 && ((1 << (_la - 68)) & ((1 << (cqlParser.T__67 - 68)) | (1 << (cqlParser.T__68 - 68)) | (1 << (cqlParser.T__69 - 68)) | (1 << (cqlParser.T__70 - 68)) | (1 << (cqlParser.T__71 - 68)) | (1 << (cqlParser.T__72 - 68)) | (1 << (cqlParser.T__73 - 68)))) !== 0)) {
                this.state = 708;
                this.dateTimePrecision();
            }

            this.state = 713;
            switch(this._input.LA(1)) {
            case cqlParser.T__110:
            case cqlParser.T__111:
                this.state = 711;
                this.relativeQualifier();
                break;
            case cqlParser.T__49:
                this.state = 712;
                this.match(cqlParser.T__49);
                break;
            default:
                throw new antlr4.error.NoViableAltException(this);
            }
            this.state = 716;
            var la_ = this._interp.adaptivePredict(this._input,64,this._ctx);
            if(la_===1) {
                this.state = 715;
                _la = this._input.LA(1);
                if(!(_la===cqlParser.T__88 || _la===cqlParser.T__89)) {
                this._errHandler.recoverInline(this);
                }
                else {
                    this.consume();
                }

            }
            break;

        case 2:
            localctx = new IncludesIntervalOperatorPhraseContext(this, localctx);
            this.enterOuterAlt(localctx, 2);
            this.state = 719;
            _la = this._input.LA(1);
            if(_la===cqlParser.T__52) {
                this.state = 718;
                this.match(cqlParser.T__52);
            }

            this.state = 721;
            this.match(cqlParser.T__118);
            this.state = 723;
            var la_ = this._interp.adaptivePredict(this._input,66,this._ctx);
            if(la_===1) {
                this.state = 722;
                this.dateTimePrecisionSpecifier();

            }
            this.state = 726;
            var la_ = this._interp.adaptivePredict(this._input,67,this._ctx);
            if(la_===1) {
                this.state = 725;
                _la = this._input.LA(1);
                if(!(_la===cqlParser.T__88 || _la===cqlParser.T__89)) {
                this._errHandler.recoverInline(this);
                }
                else {
                    this.consume();
                }

            }
            break;

        case 3:
            localctx = new IncludedInIntervalOperatorPhraseContext(this, localctx);
            this.enterOuterAlt(localctx, 3);
            this.state = 729;
            _la = this._input.LA(1);
            if(((((_la - 115)) & ~0x1f) == 0 && ((1 << (_la - 115)) & ((1 << (cqlParser.T__114 - 115)) | (1 << (cqlParser.T__115 - 115)) | (1 << (cqlParser.T__116 - 115)))) !== 0)) {
                this.state = 728;
                _la = this._input.LA(1);
                if(!(((((_la - 115)) & ~0x1f) == 0 && ((1 << (_la - 115)) & ((1 << (cqlParser.T__114 - 115)) | (1 << (cqlParser.T__115 - 115)) | (1 << (cqlParser.T__116 - 115)))) !== 0))) {
                this._errHandler.recoverInline(this);
                }
                else {
                    this.consume();
                }
            }

            this.state = 732;
            _la = this._input.LA(1);
            if(_la===cqlParser.T__52) {
                this.state = 731;
                this.match(cqlParser.T__52);
            }

            this.state = 734;
            _la = this._input.LA(1);
            if(!(_la===cqlParser.T__119 || _la===cqlParser.T__120)) {
            this._errHandler.recoverInline(this);
            }
            else {
                this.consume();
            }
            this.state = 736;
            var la_ = this._interp.adaptivePredict(this._input,70,this._ctx);
            if(la_===1) {
                this.state = 735;
                this.dateTimePrecisionSpecifier();

            }
            break;

        case 4:
            localctx = new BeforeOrAfterIntervalOperatorPhraseContext(this, localctx);
            this.enterOuterAlt(localctx, 4);
            this.state = 739;
            _la = this._input.LA(1);
            if(((((_la - 115)) & ~0x1f) == 0 && ((1 << (_la - 115)) & ((1 << (cqlParser.T__114 - 115)) | (1 << (cqlParser.T__115 - 115)) | (1 << (cqlParser.T__116 - 115)))) !== 0)) {
                this.state = 738;
                _la = this._input.LA(1);
                if(!(((((_la - 115)) & ~0x1f) == 0 && ((1 << (_la - 115)) & ((1 << (cqlParser.T__114 - 115)) | (1 << (cqlParser.T__115 - 115)) | (1 << (cqlParser.T__116 - 115)))) !== 0))) {
                this._errHandler.recoverInline(this);
                }
                else {
                    this.consume();
                }
            }

            this.state = 742;
            _la = this._input.LA(1);
            if(_la===cqlParser.QUANTITY) {
                this.state = 741;
                this.quantityOffset();
            }

            this.state = 744;
            _la = this._input.LA(1);
            if(!(_la===cqlParser.T__121 || _la===cqlParser.T__122)) {
            this._errHandler.recoverInline(this);
            }
            else {
                this.consume();
            }
            this.state = 746;
            var la_ = this._interp.adaptivePredict(this._input,73,this._ctx);
            if(la_===1) {
                this.state = 745;
                this.dateTimePrecisionSpecifier();

            }
            this.state = 749;
            var la_ = this._interp.adaptivePredict(this._input,74,this._ctx);
            if(la_===1) {
                this.state = 748;
                _la = this._input.LA(1);
                if(!(_la===cqlParser.T__88 || _la===cqlParser.T__89)) {
                this._errHandler.recoverInline(this);
                }
                else {
                    this.consume();
                }

            }
            break;

        case 5:
            localctx = new WithinIntervalOperatorPhraseContext(this, localctx);
            this.enterOuterAlt(localctx, 5);
            this.state = 752;
            _la = this._input.LA(1);
            if(((((_la - 115)) & ~0x1f) == 0 && ((1 << (_la - 115)) & ((1 << (cqlParser.T__114 - 115)) | (1 << (cqlParser.T__115 - 115)) | (1 << (cqlParser.T__116 - 115)))) !== 0)) {
                this.state = 751;
                _la = this._input.LA(1);
                if(!(((((_la - 115)) & ~0x1f) == 0 && ((1 << (_la - 115)) & ((1 << (cqlParser.T__114 - 115)) | (1 << (cqlParser.T__115 - 115)) | (1 << (cqlParser.T__116 - 115)))) !== 0))) {
                this._errHandler.recoverInline(this);
                }
                else {
                    this.consume();
                }
            }

            this.state = 755;
            _la = this._input.LA(1);
            if(_la===cqlParser.T__52) {
                this.state = 754;
                this.match(cqlParser.T__52);
            }

            this.state = 757;
            this.match(cqlParser.T__123);
            this.state = 758;
            this.quantityLiteral();
            this.state = 759;
            this.match(cqlParser.T__90);
            this.state = 761;
            var la_ = this._interp.adaptivePredict(this._input,77,this._ctx);
            if(la_===1) {
                this.state = 760;
                _la = this._input.LA(1);
                if(!(_la===cqlParser.T__88 || _la===cqlParser.T__89)) {
                this._errHandler.recoverInline(this);
                }
                else {
                    this.consume();
                }

            }
            break;

        case 6:
            localctx = new MeetsIntervalOperatorPhraseContext(this, localctx);
            this.enterOuterAlt(localctx, 6);
            this.state = 763;
            this.match(cqlParser.T__124);
            this.state = 765;
            _la = this._input.LA(1);
            if(_la===cqlParser.T__121 || _la===cqlParser.T__122) {
                this.state = 764;
                _la = this._input.LA(1);
                if(!(_la===cqlParser.T__121 || _la===cqlParser.T__122)) {
                this._errHandler.recoverInline(this);
                }
                else {
                    this.consume();
                }
            }

            this.state = 768;
            var la_ = this._interp.adaptivePredict(this._input,79,this._ctx);
            if(la_===1) {
                this.state = 767;
                this.dateTimePrecisionSpecifier();

            }
            break;

        case 7:
            localctx = new OverlapsIntervalOperatorPhraseContext(this, localctx);
            this.enterOuterAlt(localctx, 7);
            this.state = 770;
            this.match(cqlParser.T__125);
            this.state = 772;
            _la = this._input.LA(1);
            if(_la===cqlParser.T__121 || _la===cqlParser.T__122) {
                this.state = 771;
                _la = this._input.LA(1);
                if(!(_la===cqlParser.T__121 || _la===cqlParser.T__122)) {
                this._errHandler.recoverInline(this);
                }
                else {
                    this.consume();
                }
            }

            this.state = 775;
            var la_ = this._interp.adaptivePredict(this._input,81,this._ctx);
            if(la_===1) {
                this.state = 774;
                this.dateTimePrecisionSpecifier();

            }
            break;

        case 8:
            localctx = new StartsIntervalOperatorPhraseContext(this, localctx);
            this.enterOuterAlt(localctx, 8);
            this.state = 777;
            this.match(cqlParser.T__114);
            this.state = 779;
            var la_ = this._interp.adaptivePredict(this._input,82,this._ctx);
            if(la_===1) {
                this.state = 778;
                this.dateTimePrecisionSpecifier();

            }
            break;

        case 9:
            localctx = new EndsIntervalOperatorPhraseContext(this, localctx);
            this.enterOuterAlt(localctx, 9);
            this.state = 781;
            this.match(cqlParser.T__115);
            this.state = 783;
            var la_ = this._interp.adaptivePredict(this._input,83,this._ctx);
            if(la_===1) {
                this.state = 782;
                this.dateTimePrecisionSpecifier();

            }
            break;

        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function TermContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_term;
    return this;
}

TermContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
TermContext.prototype.constructor = TermContext;


 
TermContext.prototype.copyFrom = function(ctx) {
    antlr4.ParserRuleContext.prototype.copyFrom.call(this, ctx);
};


function TupleSelectorTermContext(parser, ctx) {
	TermContext.call(this, parser);
    TermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

TupleSelectorTermContext.prototype = Object.create(TermContext.prototype);
TupleSelectorTermContext.prototype.constructor = TupleSelectorTermContext;

cqlParser.TupleSelectorTermContext = TupleSelectorTermContext;

TupleSelectorTermContext.prototype.tupleSelector = function() {
    return this.getTypedRuleContext(TupleSelectorContext,0);
};
TupleSelectorTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTupleSelectorTerm(this);
	}
};

TupleSelectorTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTupleSelectorTerm(this);
	}
};


function IdentifierTermContext(parser, ctx) {
	TermContext.call(this, parser);
    TermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

IdentifierTermContext.prototype = Object.create(TermContext.prototype);
IdentifierTermContext.prototype.constructor = IdentifierTermContext;

cqlParser.IdentifierTermContext = IdentifierTermContext;

IdentifierTermContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};
IdentifierTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterIdentifierTerm(this);
	}
};

IdentifierTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitIdentifierTerm(this);
	}
};


function LiteralTermContext(parser, ctx) {
	TermContext.call(this, parser);
    TermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

LiteralTermContext.prototype = Object.create(TermContext.prototype);
LiteralTermContext.prototype.constructor = LiteralTermContext;

cqlParser.LiteralTermContext = LiteralTermContext;

LiteralTermContext.prototype.literal = function() {
    return this.getTypedRuleContext(LiteralContext,0);
};
LiteralTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterLiteralTerm(this);
	}
};

LiteralTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitLiteralTerm(this);
	}
};


function ConceptSelectorTermContext(parser, ctx) {
	TermContext.call(this, parser);
    TermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

ConceptSelectorTermContext.prototype = Object.create(TermContext.prototype);
ConceptSelectorTermContext.prototype.constructor = ConceptSelectorTermContext;

cqlParser.ConceptSelectorTermContext = ConceptSelectorTermContext;

ConceptSelectorTermContext.prototype.conceptSelector = function() {
    return this.getTypedRuleContext(ConceptSelectorContext,0);
};
ConceptSelectorTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterConceptSelectorTerm(this);
	}
};

ConceptSelectorTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitConceptSelectorTerm(this);
	}
};


function ParenthesizedTermContext(parser, ctx) {
	TermContext.call(this, parser);
    TermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

ParenthesizedTermContext.prototype = Object.create(TermContext.prototype);
ParenthesizedTermContext.prototype.constructor = ParenthesizedTermContext;

cqlParser.ParenthesizedTermContext = ParenthesizedTermContext;

ParenthesizedTermContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};
ParenthesizedTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterParenthesizedTerm(this);
	}
};

ParenthesizedTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitParenthesizedTerm(this);
	}
};


function CodeSelectorTermContext(parser, ctx) {
	TermContext.call(this, parser);
    TermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

CodeSelectorTermContext.prototype = Object.create(TermContext.prototype);
CodeSelectorTermContext.prototype.constructor = CodeSelectorTermContext;

cqlParser.CodeSelectorTermContext = CodeSelectorTermContext;

CodeSelectorTermContext.prototype.codeSelector = function() {
    return this.getTypedRuleContext(CodeSelectorContext,0);
};
CodeSelectorTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterCodeSelectorTerm(this);
	}
};

CodeSelectorTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitCodeSelectorTerm(this);
	}
};


function InstanceSelectorTermContext(parser, ctx) {
	TermContext.call(this, parser);
    TermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

InstanceSelectorTermContext.prototype = Object.create(TermContext.prototype);
InstanceSelectorTermContext.prototype.constructor = InstanceSelectorTermContext;

cqlParser.InstanceSelectorTermContext = InstanceSelectorTermContext;

InstanceSelectorTermContext.prototype.instanceSelector = function() {
    return this.getTypedRuleContext(InstanceSelectorContext,0);
};
InstanceSelectorTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterInstanceSelectorTerm(this);
	}
};

InstanceSelectorTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitInstanceSelectorTerm(this);
	}
};


function IntervalSelectorTermContext(parser, ctx) {
	TermContext.call(this, parser);
    TermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

IntervalSelectorTermContext.prototype = Object.create(TermContext.prototype);
IntervalSelectorTermContext.prototype.constructor = IntervalSelectorTermContext;

cqlParser.IntervalSelectorTermContext = IntervalSelectorTermContext;

IntervalSelectorTermContext.prototype.intervalSelector = function() {
    return this.getTypedRuleContext(IntervalSelectorContext,0);
};
IntervalSelectorTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterIntervalSelectorTerm(this);
	}
};

IntervalSelectorTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitIntervalSelectorTerm(this);
	}
};


function ListSelectorTermContext(parser, ctx) {
	TermContext.call(this, parser);
    TermContext.prototype.copyFrom.call(this, ctx);
    return this;
}

ListSelectorTermContext.prototype = Object.create(TermContext.prototype);
ListSelectorTermContext.prototype.constructor = ListSelectorTermContext;

cqlParser.ListSelectorTermContext = ListSelectorTermContext;

ListSelectorTermContext.prototype.listSelector = function() {
    return this.getTypedRuleContext(ListSelectorContext,0);
};
ListSelectorTermContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterListSelectorTerm(this);
	}
};

ListSelectorTermContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitListSelectorTerm(this);
	}
};



cqlParser.TermContext = TermContext;

cqlParser.prototype.term = function() {

    var localctx = new TermContext(this, this._ctx, this.state);
    this.enterRule(localctx, 122, cqlParser.RULE_term);
    try {
        this.state = 799;
        var la_ = this._interp.adaptivePredict(this._input,85,this._ctx);
        switch(la_) {
        case 1:
            localctx = new IdentifierTermContext(this, localctx);
            this.enterOuterAlt(localctx, 1);
            this.state = 787;
            this.identifier();
            break;

        case 2:
            localctx = new LiteralTermContext(this, localctx);
            this.enterOuterAlt(localctx, 2);
            this.state = 788;
            this.literal();
            break;

        case 3:
            localctx = new IntervalSelectorTermContext(this, localctx);
            this.enterOuterAlt(localctx, 3);
            this.state = 789;
            this.intervalSelector();
            break;

        case 4:
            localctx = new TupleSelectorTermContext(this, localctx);
            this.enterOuterAlt(localctx, 4);
            this.state = 790;
            this.tupleSelector();
            break;

        case 5:
            localctx = new InstanceSelectorTermContext(this, localctx);
            this.enterOuterAlt(localctx, 5);
            this.state = 791;
            this.instanceSelector();
            break;

        case 6:
            localctx = new ListSelectorTermContext(this, localctx);
            this.enterOuterAlt(localctx, 6);
            this.state = 792;
            this.listSelector();
            break;

        case 7:
            localctx = new CodeSelectorTermContext(this, localctx);
            this.enterOuterAlt(localctx, 7);
            this.state = 793;
            this.codeSelector();
            break;

        case 8:
            localctx = new ConceptSelectorTermContext(this, localctx);
            this.enterOuterAlt(localctx, 8);
            this.state = 794;
            this.conceptSelector();
            break;

        case 9:
            localctx = new ParenthesizedTermContext(this, localctx);
            this.enterOuterAlt(localctx, 9);
            this.state = 795;
            this.match(cqlParser.T__13);
            this.state = 796;
            this.expression(0);
            this.state = 797;
            this.match(cqlParser.T__15);
            break;

        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function IntervalSelectorContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_intervalSelector;
    return this;
}

IntervalSelectorContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
IntervalSelectorContext.prototype.constructor = IntervalSelectorContext;

IntervalSelectorContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};

IntervalSelectorContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterIntervalSelector(this);
	}
};

IntervalSelectorContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitIntervalSelector(this);
	}
};




cqlParser.IntervalSelectorContext = IntervalSelectorContext;

cqlParser.prototype.intervalSelector = function() {

    var localctx = new IntervalSelectorContext(this, this._ctx, this.state);
    this.enterRule(localctx, 124, cqlParser.RULE_intervalSelector);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 801;
        this.match(cqlParser.T__20);
        this.state = 802;
        _la = this._input.LA(1);
        if(!(_la===cqlParser.T__13 || _la===cqlParser.T__30)) {
        this._errHandler.recoverInline(this);
        }
        else {
            this.consume();
        }
        this.state = 803;
        this.expression(0);
        this.state = 804;
        this.match(cqlParser.T__14);
        this.state = 805;
        this.expression(0);
        this.state = 806;
        _la = this._input.LA(1);
        if(!(_la===cqlParser.T__15 || _la===cqlParser.T__32)) {
        this._errHandler.recoverInline(this);
        }
        else {
            this.consume();
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function TupleSelectorContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_tupleSelector;
    return this;
}

TupleSelectorContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
TupleSelectorContext.prototype.constructor = TupleSelectorContext;

TupleSelectorContext.prototype.tupleElementSelector = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(TupleElementSelectorContext);
    } else {
        return this.getTypedRuleContext(TupleElementSelectorContext,i);
    }
};

TupleSelectorContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTupleSelector(this);
	}
};

TupleSelectorContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTupleSelector(this);
	}
};




cqlParser.TupleSelectorContext = TupleSelectorContext;

cqlParser.prototype.tupleSelector = function() {

    var localctx = new TupleSelectorContext(this, this._ctx, this.state);
    this.enterRule(localctx, 126, cqlParser.RULE_tupleSelector);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 809;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__21) {
            this.state = 808;
            this.match(cqlParser.T__21);
        }

        this.state = 811;
        this.match(cqlParser.T__22);
        this.state = 821;
        switch(this._input.LA(1)) {
        case cqlParser.T__10:
            this.state = 812;
            this.match(cqlParser.T__10);
            break;
        case cqlParser.T__1:
        case cqlParser.T__74:
        case cqlParser.T__75:
        case cqlParser.T__76:
        case cqlParser.T__126:
        case cqlParser.T__127:
        case cqlParser.T__128:
        case cqlParser.IDENTIFIER:
        case cqlParser.QUOTEDIDENTIFIER:
            this.state = 813;
            this.tupleElementSelector();
            this.state = 818;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
            while(_la===cqlParser.T__14) {
                this.state = 814;
                this.match(cqlParser.T__14);
                this.state = 815;
                this.tupleElementSelector();
                this.state = 820;
                this._errHandler.sync(this);
                _la = this._input.LA(1);
            }
            break;
        default:
            throw new antlr4.error.NoViableAltException(this);
        }
        this.state = 823;
        this.match(cqlParser.T__23);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function TupleElementSelectorContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_tupleElementSelector;
    return this;
}

TupleElementSelectorContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
TupleElementSelectorContext.prototype.constructor = TupleElementSelectorContext;

TupleElementSelectorContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

TupleElementSelectorContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

TupleElementSelectorContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTupleElementSelector(this);
	}
};

TupleElementSelectorContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTupleElementSelector(this);
	}
};




cqlParser.TupleElementSelectorContext = TupleElementSelectorContext;

cqlParser.prototype.tupleElementSelector = function() {

    var localctx = new TupleElementSelectorContext(this, this._ctx, this.state);
    this.enterRule(localctx, 128, cqlParser.RULE_tupleElementSelector);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 825;
        this.identifier();
        this.state = 826;
        this.match(cqlParser.T__10);
        this.state = 827;
        this.expression(0);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function InstanceSelectorContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_instanceSelector;
    return this;
}

InstanceSelectorContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
InstanceSelectorContext.prototype.constructor = InstanceSelectorContext;

InstanceSelectorContext.prototype.namedTypeSpecifier = function() {
    return this.getTypedRuleContext(NamedTypeSpecifierContext,0);
};

InstanceSelectorContext.prototype.instanceElementSelector = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(InstanceElementSelectorContext);
    } else {
        return this.getTypedRuleContext(InstanceElementSelectorContext,i);
    }
};

InstanceSelectorContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterInstanceSelector(this);
	}
};

InstanceSelectorContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitInstanceSelector(this);
	}
};




cqlParser.InstanceSelectorContext = InstanceSelectorContext;

cqlParser.prototype.instanceSelector = function() {

    var localctx = new InstanceSelectorContext(this, this._ctx, this.state);
    this.enterRule(localctx, 130, cqlParser.RULE_instanceSelector);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 829;
        this.namedTypeSpecifier();
        this.state = 830;
        this.match(cqlParser.T__22);
        this.state = 840;
        switch(this._input.LA(1)) {
        case cqlParser.T__10:
            this.state = 831;
            this.match(cqlParser.T__10);
            break;
        case cqlParser.T__1:
        case cqlParser.T__74:
        case cqlParser.T__75:
        case cqlParser.T__76:
        case cqlParser.T__126:
        case cqlParser.T__127:
        case cqlParser.T__128:
        case cqlParser.IDENTIFIER:
        case cqlParser.QUOTEDIDENTIFIER:
            this.state = 832;
            this.instanceElementSelector();
            this.state = 837;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
            while(_la===cqlParser.T__14) {
                this.state = 833;
                this.match(cqlParser.T__14);
                this.state = 834;
                this.instanceElementSelector();
                this.state = 839;
                this._errHandler.sync(this);
                _la = this._input.LA(1);
            }
            break;
        default:
            throw new antlr4.error.NoViableAltException(this);
        }
        this.state = 842;
        this.match(cqlParser.T__23);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function InstanceElementSelectorContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_instanceElementSelector;
    return this;
}

InstanceElementSelectorContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
InstanceElementSelectorContext.prototype.constructor = InstanceElementSelectorContext;

InstanceElementSelectorContext.prototype.identifier = function() {
    return this.getTypedRuleContext(IdentifierContext,0);
};

InstanceElementSelectorContext.prototype.expression = function() {
    return this.getTypedRuleContext(ExpressionContext,0);
};

InstanceElementSelectorContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterInstanceElementSelector(this);
	}
};

InstanceElementSelectorContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitInstanceElementSelector(this);
	}
};




cqlParser.InstanceElementSelectorContext = InstanceElementSelectorContext;

cqlParser.prototype.instanceElementSelector = function() {

    var localctx = new InstanceElementSelectorContext(this, this._ctx, this.state);
    this.enterRule(localctx, 132, cqlParser.RULE_instanceElementSelector);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 844;
        this.identifier();
        this.state = 845;
        this.match(cqlParser.T__10);
        this.state = 846;
        this.expression(0);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ListSelectorContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_listSelector;
    return this;
}

ListSelectorContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ListSelectorContext.prototype.constructor = ListSelectorContext;

ListSelectorContext.prototype.expression = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(ExpressionContext);
    } else {
        return this.getTypedRuleContext(ExpressionContext,i);
    }
};

ListSelectorContext.prototype.typeSpecifier = function() {
    return this.getTypedRuleContext(TypeSpecifierContext,0);
};

ListSelectorContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterListSelector(this);
	}
};

ListSelectorContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitListSelector(this);
	}
};




cqlParser.ListSelectorContext = ListSelectorContext;

cqlParser.prototype.listSelector = function() {

    var localctx = new ListSelectorContext(this, this._ctx, this.state);
    this.enterRule(localctx, 134, cqlParser.RULE_listSelector);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 855;
        _la = this._input.LA(1);
        if(_la===cqlParser.T__17) {
            this.state = 848;
            this.match(cqlParser.T__17);
            this.state = 853;
            _la = this._input.LA(1);
            if(_la===cqlParser.T__18) {
                this.state = 849;
                this.match(cqlParser.T__18);
                this.state = 850;
                this.typeSpecifier();
                this.state = 851;
                this.match(cqlParser.T__19);
            }

        }

        this.state = 857;
        this.match(cqlParser.T__22);
        this.state = 866;
        _la = this._input.LA(1);
        if((((_la) & ~0x1f) == 0 && ((1 << _la) & ((1 << cqlParser.T__1) | (1 << cqlParser.T__13) | (1 << cqlParser.T__17) | (1 << cqlParser.T__20) | (1 << cqlParser.T__21) | (1 << cqlParser.T__22) | (1 << cqlParser.T__30))) !== 0) || ((((_la - 34)) & ~0x1f) == 0 && ((1 << (_la - 34)) & ((1 << (cqlParser.T__33 - 34)) | (1 << (cqlParser.T__37 - 34)) | (1 << (cqlParser.T__45 - 34)) | (1 << (cqlParser.T__46 - 34)) | (1 << (cqlParser.T__47 - 34)) | (1 << (cqlParser.T__48 - 34)) | (1 << (cqlParser.T__50 - 34)) | (1 << (cqlParser.T__51 - 34)) | (1 << (cqlParser.T__55 - 34)))) !== 0) || ((((_la - 68)) & ~0x1f) == 0 && ((1 << (_la - 68)) & ((1 << (cqlParser.T__67 - 68)) | (1 << (cqlParser.T__68 - 68)) | (1 << (cqlParser.T__69 - 68)) | (1 << (cqlParser.T__70 - 68)) | (1 << (cqlParser.T__71 - 68)) | (1 << (cqlParser.T__72 - 68)) | (1 << (cqlParser.T__73 - 68)) | (1 << (cqlParser.T__74 - 68)) | (1 << (cqlParser.T__75 - 68)) | (1 << (cqlParser.T__76 - 68)) | (1 << (cqlParser.T__77 - 68)) | (1 << (cqlParser.T__78 - 68)) | (1 << (cqlParser.T__79 - 68)) | (1 << (cqlParser.T__80 - 68)) | (1 << (cqlParser.T__81 - 68)) | (1 << (cqlParser.T__82 - 68)) | (1 << (cqlParser.T__83 - 68)) | (1 << (cqlParser.T__84 - 68)) | (1 << (cqlParser.T__86 - 68)) | (1 << (cqlParser.T__87 - 68)) | (1 << (cqlParser.T__88 - 68)) | (1 << (cqlParser.T__89 - 68)) | (1 << (cqlParser.T__91 - 68)) | (1 << (cqlParser.T__92 - 68)) | (1 << (cqlParser.T__93 - 68)) | (1 << (cqlParser.T__94 - 68)) | (1 << (cqlParser.T__95 - 68)) | (1 << (cqlParser.T__96 - 68)) | (1 << (cqlParser.T__97 - 68)))) !== 0) || ((((_la - 104)) & ~0x1f) == 0 && ((1 << (_la - 104)) & ((1 << (cqlParser.T__103 - 104)) | (1 << (cqlParser.T__106 - 104)) | (1 << (cqlParser.T__107 - 104)) | (1 << (cqlParser.T__108 - 104)) | (1 << (cqlParser.T__126 - 104)) | (1 << (cqlParser.T__127 - 104)) | (1 << (cqlParser.T__128 - 104)) | (1 << (cqlParser.IDENTIFIER - 104)) | (1 << (cqlParser.QUANTITY - 104)) | (1 << (cqlParser.DATETIME - 104)) | (1 << (cqlParser.TIME - 104)) | (1 << (cqlParser.QUOTEDIDENTIFIER - 104)) | (1 << (cqlParser.STRING - 104)))) !== 0)) {
            this.state = 858;
            this.expression(0);
            this.state = 863;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
            while(_la===cqlParser.T__14) {
                this.state = 859;
                this.match(cqlParser.T__14);
                this.state = 860;
                this.expression(0);
                this.state = 865;
                this._errHandler.sync(this);
                _la = this._input.LA(1);
            }
        }

        this.state = 868;
        this.match(cqlParser.T__23);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function DisplayClauseContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_displayClause;
    return this;
}

DisplayClauseContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
DisplayClauseContext.prototype.constructor = DisplayClauseContext;

DisplayClauseContext.prototype.stringLiteral = function() {
    return this.getTypedRuleContext(StringLiteralContext,0);
};

DisplayClauseContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterDisplayClause(this);
	}
};

DisplayClauseContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitDisplayClause(this);
	}
};




cqlParser.DisplayClauseContext = DisplayClauseContext;

cqlParser.prototype.displayClause = function() {

    var localctx = new DisplayClauseContext(this, this._ctx, this.state);
    this.enterRule(localctx, 136, cqlParser.RULE_displayClause);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 870;
        this.match(cqlParser.T__126);
        this.state = 871;
        this.stringLiteral();
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function CodeSelectorContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_codeSelector;
    return this;
}

CodeSelectorContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
CodeSelectorContext.prototype.constructor = CodeSelectorContext;

CodeSelectorContext.prototype.stringLiteral = function() {
    return this.getTypedRuleContext(StringLiteralContext,0);
};

CodeSelectorContext.prototype.codesystemIdentifier = function() {
    return this.getTypedRuleContext(CodesystemIdentifierContext,0);
};

CodeSelectorContext.prototype.displayClause = function() {
    return this.getTypedRuleContext(DisplayClauseContext,0);
};

CodeSelectorContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterCodeSelector(this);
	}
};

CodeSelectorContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitCodeSelector(this);
	}
};




cqlParser.CodeSelectorContext = CodeSelectorContext;

cqlParser.prototype.codeSelector = function() {

    var localctx = new CodeSelectorContext(this, this._ctx, this.state);
    this.enterRule(localctx, 138, cqlParser.RULE_codeSelector);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 873;
        this.match(cqlParser.T__127);
        this.state = 874;
        this.stringLiteral();
        this.state = 875;
        this.match(cqlParser.T__33);
        this.state = 876;
        this.codesystemIdentifier();
        this.state = 878;
        var la_ = this._interp.adaptivePredict(this._input,95,this._ctx);
        if(la_===1) {
            this.state = 877;
            this.displayClause();

        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function ConceptSelectorContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_conceptSelector;
    return this;
}

ConceptSelectorContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
ConceptSelectorContext.prototype.constructor = ConceptSelectorContext;

ConceptSelectorContext.prototype.codeSelector = function(i) {
    if(i===undefined) {
        i = null;
    }
    if(i===null) {
        return this.getTypedRuleContexts(CodeSelectorContext);
    } else {
        return this.getTypedRuleContext(CodeSelectorContext,i);
    }
};

ConceptSelectorContext.prototype.displayClause = function() {
    return this.getTypedRuleContext(DisplayClauseContext,0);
};

ConceptSelectorContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterConceptSelector(this);
	}
};

ConceptSelectorContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitConceptSelector(this);
	}
};




cqlParser.ConceptSelectorContext = ConceptSelectorContext;

cqlParser.prototype.conceptSelector = function() {

    var localctx = new ConceptSelectorContext(this, this._ctx, this.state);
    this.enterRule(localctx, 140, cqlParser.RULE_conceptSelector);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 880;
        this.match(cqlParser.T__128);
        this.state = 881;
        this.match(cqlParser.T__22);
        this.state = 882;
        this.codeSelector();
        this.state = 887;
        this._errHandler.sync(this);
        _la = this._input.LA(1);
        while(_la===cqlParser.T__14) {
            this.state = 883;
            this.match(cqlParser.T__14);
            this.state = 884;
            this.codeSelector();
            this.state = 889;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
        }
        this.state = 890;
        this.match(cqlParser.T__23);
        this.state = 892;
        var la_ = this._interp.adaptivePredict(this._input,97,this._ctx);
        if(la_===1) {
            this.state = 891;
            this.displayClause();

        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function LiteralContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_literal;
    return this;
}

LiteralContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
LiteralContext.prototype.constructor = LiteralContext;

LiteralContext.prototype.nullLiteral = function() {
    return this.getTypedRuleContext(NullLiteralContext,0);
};

LiteralContext.prototype.booleanLiteral = function() {
    return this.getTypedRuleContext(BooleanLiteralContext,0);
};

LiteralContext.prototype.stringLiteral = function() {
    return this.getTypedRuleContext(StringLiteralContext,0);
};

LiteralContext.prototype.dateTimeLiteral = function() {
    return this.getTypedRuleContext(DateTimeLiteralContext,0);
};

LiteralContext.prototype.timeLiteral = function() {
    return this.getTypedRuleContext(TimeLiteralContext,0);
};

LiteralContext.prototype.quantityLiteral = function() {
    return this.getTypedRuleContext(QuantityLiteralContext,0);
};

LiteralContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterLiteral(this);
	}
};

LiteralContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitLiteral(this);
	}
};




cqlParser.LiteralContext = LiteralContext;

cqlParser.prototype.literal = function() {

    var localctx = new LiteralContext(this, this._ctx, this.state);
    this.enterRule(localctx, 142, cqlParser.RULE_literal);
    try {
        this.state = 900;
        switch(this._input.LA(1)) {
        case cqlParser.T__46:
            this.enterOuterAlt(localctx, 1);
            this.state = 894;
            this.nullLiteral();
            break;
        case cqlParser.T__47:
        case cqlParser.T__48:
            this.enterOuterAlt(localctx, 2);
            this.state = 895;
            this.booleanLiteral();
            break;
        case cqlParser.STRING:
            this.enterOuterAlt(localctx, 3);
            this.state = 896;
            this.stringLiteral();
            break;
        case cqlParser.DATETIME:
            this.enterOuterAlt(localctx, 4);
            this.state = 897;
            this.dateTimeLiteral();
            break;
        case cqlParser.TIME:
            this.enterOuterAlt(localctx, 5);
            this.state = 898;
            this.timeLiteral();
            break;
        case cqlParser.QUANTITY:
            this.enterOuterAlt(localctx, 6);
            this.state = 899;
            this.quantityLiteral();
            break;
        default:
            throw new antlr4.error.NoViableAltException(this);
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function NullLiteralContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_nullLiteral;
    return this;
}

NullLiteralContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
NullLiteralContext.prototype.constructor = NullLiteralContext;


NullLiteralContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterNullLiteral(this);
	}
};

NullLiteralContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitNullLiteral(this);
	}
};




cqlParser.NullLiteralContext = NullLiteralContext;

cqlParser.prototype.nullLiteral = function() {

    var localctx = new NullLiteralContext(this, this._ctx, this.state);
    this.enterRule(localctx, 144, cqlParser.RULE_nullLiteral);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 902;
        this.match(cqlParser.T__46);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function BooleanLiteralContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_booleanLiteral;
    return this;
}

BooleanLiteralContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
BooleanLiteralContext.prototype.constructor = BooleanLiteralContext;


BooleanLiteralContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterBooleanLiteral(this);
	}
};

BooleanLiteralContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitBooleanLiteral(this);
	}
};




cqlParser.BooleanLiteralContext = BooleanLiteralContext;

cqlParser.prototype.booleanLiteral = function() {

    var localctx = new BooleanLiteralContext(this, this._ctx, this.state);
    this.enterRule(localctx, 146, cqlParser.RULE_booleanLiteral);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 904;
        _la = this._input.LA(1);
        if(!(_la===cqlParser.T__47 || _la===cqlParser.T__48)) {
        this._errHandler.recoverInline(this);
        }
        else {
            this.consume();
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function StringLiteralContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_stringLiteral;
    return this;
}

StringLiteralContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
StringLiteralContext.prototype.constructor = StringLiteralContext;

StringLiteralContext.prototype.STRING = function() {
    return this.getToken(cqlParser.STRING, 0);
};

StringLiteralContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterStringLiteral(this);
	}
};

StringLiteralContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitStringLiteral(this);
	}
};




cqlParser.StringLiteralContext = StringLiteralContext;

cqlParser.prototype.stringLiteral = function() {

    var localctx = new StringLiteralContext(this, this._ctx, this.state);
    this.enterRule(localctx, 148, cqlParser.RULE_stringLiteral);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 906;
        this.match(cqlParser.STRING);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function DateTimeLiteralContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_dateTimeLiteral;
    return this;
}

DateTimeLiteralContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
DateTimeLiteralContext.prototype.constructor = DateTimeLiteralContext;

DateTimeLiteralContext.prototype.DATETIME = function() {
    return this.getToken(cqlParser.DATETIME, 0);
};

DateTimeLiteralContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterDateTimeLiteral(this);
	}
};

DateTimeLiteralContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitDateTimeLiteral(this);
	}
};




cqlParser.DateTimeLiteralContext = DateTimeLiteralContext;

cqlParser.prototype.dateTimeLiteral = function() {

    var localctx = new DateTimeLiteralContext(this, this._ctx, this.state);
    this.enterRule(localctx, 150, cqlParser.RULE_dateTimeLiteral);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 908;
        this.match(cqlParser.DATETIME);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function TimeLiteralContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_timeLiteral;
    return this;
}

TimeLiteralContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
TimeLiteralContext.prototype.constructor = TimeLiteralContext;

TimeLiteralContext.prototype.TIME = function() {
    return this.getToken(cqlParser.TIME, 0);
};

TimeLiteralContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterTimeLiteral(this);
	}
};

TimeLiteralContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitTimeLiteral(this);
	}
};




cqlParser.TimeLiteralContext = TimeLiteralContext;

cqlParser.prototype.timeLiteral = function() {

    var localctx = new TimeLiteralContext(this, this._ctx, this.state);
    this.enterRule(localctx, 152, cqlParser.RULE_timeLiteral);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 910;
        this.match(cqlParser.TIME);
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function QuantityLiteralContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_quantityLiteral;
    return this;
}

QuantityLiteralContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
QuantityLiteralContext.prototype.constructor = QuantityLiteralContext;

QuantityLiteralContext.prototype.QUANTITY = function() {
    return this.getToken(cqlParser.QUANTITY, 0);
};

QuantityLiteralContext.prototype.unit = function() {
    return this.getTypedRuleContext(UnitContext,0);
};

QuantityLiteralContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterQuantityLiteral(this);
	}
};

QuantityLiteralContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitQuantityLiteral(this);
	}
};




cqlParser.QuantityLiteralContext = QuantityLiteralContext;

cqlParser.prototype.quantityLiteral = function() {

    var localctx = new QuantityLiteralContext(this, this._ctx, this.state);
    this.enterRule(localctx, 154, cqlParser.RULE_quantityLiteral);
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 912;
        this.match(cqlParser.QUANTITY);
        this.state = 914;
        var la_ = this._interp.adaptivePredict(this._input,99,this._ctx);
        if(la_===1) {
            this.state = 913;
            this.unit();

        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function UnitContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_unit;
    return this;
}

UnitContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
UnitContext.prototype.constructor = UnitContext;

UnitContext.prototype.dateTimePrecision = function() {
    return this.getTypedRuleContext(DateTimePrecisionContext,0);
};

UnitContext.prototype.pluralDateTimePrecision = function() {
    return this.getTypedRuleContext(PluralDateTimePrecisionContext,0);
};

UnitContext.prototype.STRING = function() {
    return this.getToken(cqlParser.STRING, 0);
};

UnitContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterUnit(this);
	}
};

UnitContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitUnit(this);
	}
};




cqlParser.UnitContext = UnitContext;

cqlParser.prototype.unit = function() {

    var localctx = new UnitContext(this, this._ctx, this.state);
    this.enterRule(localctx, 156, cqlParser.RULE_unit);
    try {
        this.state = 919;
        switch(this._input.LA(1)) {
        case cqlParser.T__67:
        case cqlParser.T__68:
        case cqlParser.T__69:
        case cqlParser.T__70:
        case cqlParser.T__71:
        case cqlParser.T__72:
        case cqlParser.T__73:
            this.enterOuterAlt(localctx, 1);
            this.state = 916;
            this.dateTimePrecision();
            break;
        case cqlParser.T__77:
        case cqlParser.T__78:
        case cqlParser.T__79:
        case cqlParser.T__80:
        case cqlParser.T__81:
        case cqlParser.T__82:
        case cqlParser.T__83:
            this.enterOuterAlt(localctx, 2);
            this.state = 917;
            this.pluralDateTimePrecision();
            break;
        case cqlParser.STRING:
            this.enterOuterAlt(localctx, 3);
            this.state = 918;
            this.match(cqlParser.STRING);
            break;
        default:
            throw new antlr4.error.NoViableAltException(this);
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};

function IdentifierContext(parser, parent, invokingState) {
	if(parent===undefined) {
	    parent = null;
	}
	if(invokingState===undefined || invokingState===null) {
		invokingState = -1;
	}
	antlr4.ParserRuleContext.call(this, parent, invokingState);
    this.parser = parser;
    this.ruleIndex = cqlParser.RULE_identifier;
    return this;
}

IdentifierContext.prototype = Object.create(antlr4.ParserRuleContext.prototype);
IdentifierContext.prototype.constructor = IdentifierContext;

IdentifierContext.prototype.IDENTIFIER = function() {
    return this.getToken(cqlParser.IDENTIFIER, 0);
};

IdentifierContext.prototype.QUOTEDIDENTIFIER = function() {
    return this.getToken(cqlParser.QUOTEDIDENTIFIER, 0);
};

IdentifierContext.prototype.enterRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.enterIdentifier(this);
	}
};

IdentifierContext.prototype.exitRule = function(listener) {
    if(listener instanceof cqlListener ) {
        listener.exitIdentifier(this);
	}
};




cqlParser.IdentifierContext = IdentifierContext;

cqlParser.prototype.identifier = function() {

    var localctx = new IdentifierContext(this, this._ctx, this.state);
    this.enterRule(localctx, 158, cqlParser.RULE_identifier);
    var _la = 0; // Token type
    try {
        this.enterOuterAlt(localctx, 1);
        this.state = 921;
        _la = this._input.LA(1);
        if(!(_la===cqlParser.T__1 || ((((_la - 75)) & ~0x1f) == 0 && ((1 << (_la - 75)) & ((1 << (cqlParser.T__74 - 75)) | (1 << (cqlParser.T__75 - 75)) | (1 << (cqlParser.T__76 - 75)))) !== 0) || ((((_la - 127)) & ~0x1f) == 0 && ((1 << (_la - 127)) & ((1 << (cqlParser.T__126 - 127)) | (1 << (cqlParser.T__127 - 127)) | (1 << (cqlParser.T__128 - 127)) | (1 << (cqlParser.IDENTIFIER - 127)) | (1 << (cqlParser.QUOTEDIDENTIFIER - 127)))) !== 0))) {
        this._errHandler.recoverInline(this);
        }
        else {
            this.consume();
        }
    } catch (re) {
    	if(re instanceof antlr4.error.RecognitionException) {
	        localctx.exception = re;
	        this._errHandler.reportError(this, re);
	        this._errHandler.recover(this, re);
	    } else {
	    	throw re;
	    }
    } finally {
        this.exitRule();
    }
    return localctx;
};


cqlParser.prototype.sempred = function(localctx, ruleIndex, predIndex) {
	switch(ruleIndex) {
	case 50:
			return this.expression_sempred(localctx, predIndex);
	case 54:
			return this.expressionTerm_sempred(localctx, predIndex);
    default:
        throw "No predicate with index:" + ruleIndex;
   }
};

cqlParser.prototype.expression_sempred = function(localctx, predIndex) {
	switch(predIndex) {
		case 0:
			return this.precpred(this._ctx, 7);
		case 1:
			return this.precpred(this._ctx, 6);
		case 2:
			return this.precpred(this._ctx, 5);
		case 3:
			return this.precpred(this._ctx, 4);
		case 4:
			return this.precpred(this._ctx, 3);
		case 5:
			return this.precpred(this._ctx, 2);
		case 6:
			return this.precpred(this._ctx, 1);
		case 7:
			return this.precpred(this._ctx, 15);
		case 8:
			return this.precpred(this._ctx, 14);
		case 9:
			return this.precpred(this._ctx, 10);
		default:
			throw "No predicate with index:" + predIndex;
	}
};

cqlParser.prototype.expressionTerm_sempred = function(localctx, predIndex) {
	switch(predIndex) {
		case 10:
			return this.precpred(this._ctx, 6);
		case 11:
			return this.precpred(this._ctx, 5);
		case 12:
			return this.precpred(this._ctx, 4);
		case 13:
			return this.precpred(this._ctx, 19);
		case 14:
			return this.precpred(this._ctx, 18);
		default:
			throw "No predicate with index:" + predIndex;
	}
};


exports.cqlParser = cqlParser;
});

define("ace/mode/cql_worker",["require","exports","module","ace/lib/oop","ace/worker/mirror","ace/mode/cql/cqlLexer","ace/mode/cql/cqlParser","ace/mode/cql/cqlListener","ace/mode/cql/antlr4/InputStream","ace/mode/cql/antlr4/CommonTokenStream","ace/mode/cql/antlr4/error/ErrorListener"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var Mirror = require("../worker/mirror").Mirror;
var cqlLexer = require("./cql/cqlLexer").cqlLexer;
var cqlParser = require("./cql/cqlParser").cqlParser;
var cqlListener = require("./cql/cqlListener").cqlListener;

var InputStream = require("./cql/antlr4/InputStream").InputStream;
var CommonTokenStream = require("./cql/antlr4/CommonTokenStream").CommonTokenStream;
var ErrorListener = require("./cql/antlr4/error/ErrorListener").ErrorListener;

function AceErrorListener() {
    ErrorListener.call(this);
    this.errors = [];
    return this;
}

AceErrorListener.prototype = Object.create(ErrorListener.prototype);
AceErrorListener.prototype.constructor = AceErrorListener;
AceErrorListener.prototype.reset = function(){this.errors = []}
AceErrorListener.prototype.syntaxError = function(recognizer, offendingSymbol, line, column, msg, e) {

    this.errors.push({
        row: line-1,
        column: column,
        endRow: line-1,
        endColumn: column,
        text: msg,
        type: "error"
    });
     
};

window.addEventListener = function() {};


var Worker = exports.Worker = function(sender) {
    Mirror.call(this, sender);
    this.errorListener = new AceErrorListener()
    this.setTimeout(250);
};

oop.inherits(Worker, Mirror);

(function() {

    this.onUpdate = function() {
        var value = this.doc.getValue();
        var errors = [];
        var chars = new InputStream(value);
        var lexer = new cqlLexer(chars);
        var tokens  = new CommonTokenStream(lexer);
        var parser = new cqlParser(tokens);
        var listener = new cqlListener();
        parser.addParseListener(listener);
        parser.addErrorListener(this.errorListener);
        parser.buildParseTrees = true;
        this.errorListener.reset();
        var tree = parser.logic();
        this.sender.emit("updateCqlModel", listener.toModel());
        if(! (value.replace(/\n/g, '').trim() == '') ){
            this.sender.emit("annotate", this.errorListener.errors);
        }else{
            this.sender.emit("annotate", []);
        }
    }

}).call(Worker.prototype);

});

define("ace/lib/es5-shim",["require","exports","module"], function(require, exports, module) {

function Empty() {}

if (!Function.prototype.bind) {
    Function.prototype.bind = function bind(that) { // .length is 1
        var target = this;
        if (typeof target != "function") {
            throw new TypeError("Function.prototype.bind called on incompatible " + target);
        }
        var args = slice.call(arguments, 1); // for normal call
        var bound = function () {

            if (this instanceof bound) {

                var result = target.apply(
                    this,
                    args.concat(slice.call(arguments))
                );
                if (Object(result) === result) {
                    return result;
                }
                return this;

            } else {
                return target.apply(
                    that,
                    args.concat(slice.call(arguments))
                );

            }

        };
        if(target.prototype) {
            Empty.prototype = target.prototype;
            bound.prototype = new Empty();
            Empty.prototype = null;
        }
        return bound;
    };
}
var call = Function.prototype.call;
var prototypeOfArray = Array.prototype;
var prototypeOfObject = Object.prototype;
var slice = prototypeOfArray.slice;
var _toString = call.bind(prototypeOfObject.toString);
var owns = call.bind(prototypeOfObject.hasOwnProperty);
var defineGetter;
var defineSetter;
var lookupGetter;
var lookupSetter;
var supportsAccessors;
if ((supportsAccessors = owns(prototypeOfObject, "__defineGetter__"))) {
    defineGetter = call.bind(prototypeOfObject.__defineGetter__);
    defineSetter = call.bind(prototypeOfObject.__defineSetter__);
    lookupGetter = call.bind(prototypeOfObject.__lookupGetter__);
    lookupSetter = call.bind(prototypeOfObject.__lookupSetter__);
}
if ([1,2].splice(0).length != 2) {
    if(function() { // test IE < 9 to splice bug - see issue #138
        function makeArray(l) {
            var a = new Array(l+2);
            a[0] = a[1] = 0;
            return a;
        }
        var array = [], lengthBefore;
        
        array.splice.apply(array, makeArray(20));
        array.splice.apply(array, makeArray(26));

        lengthBefore = array.length; //46
        array.splice(5, 0, "XXX"); // add one element

        lengthBefore + 1 == array.length

        if (lengthBefore + 1 == array.length) {
            return true;// has right splice implementation without bugs
        }
    }()) {//IE 6/7
        var array_splice = Array.prototype.splice;
        Array.prototype.splice = function(start, deleteCount) {
            if (!arguments.length) {
                return [];
            } else {
                return array_splice.apply(this, [
                    start === void 0 ? 0 : start,
                    deleteCount === void 0 ? (this.length - start) : deleteCount
                ].concat(slice.call(arguments, 2)))
            }
        };
    } else {//IE8
        Array.prototype.splice = function(pos, removeCount){
            var length = this.length;
            if (pos > 0) {
                if (pos > length)
                    pos = length;
            } else if (pos == void 0) {
                pos = 0;
            } else if (pos < 0) {
                pos = Math.max(length + pos, 0);
            }

            if (!(pos+removeCount < length))
                removeCount = length - pos;

            var removed = this.slice(pos, pos+removeCount);
            var insert = slice.call(arguments, 2);
            var add = insert.length;            
            if (pos === length) {
                if (add) {
                    this.push.apply(this, insert);
                }
            } else {
                var remove = Math.min(removeCount, length - pos);
                var tailOldPos = pos + remove;
                var tailNewPos = tailOldPos + add - remove;
                var tailCount = length - tailOldPos;
                var lengthAfterRemove = length - remove;

                if (tailNewPos < tailOldPos) { // case A
                    for (var i = 0; i < tailCount; ++i) {
                        this[tailNewPos+i] = this[tailOldPos+i];
                    }
                } else if (tailNewPos > tailOldPos) { // case B
                    for (i = tailCount; i--; ) {
                        this[tailNewPos+i] = this[tailOldPos+i];
                    }
                } // else, add == remove (nothing to do)

                if (add && pos === lengthAfterRemove) {
                    this.length = lengthAfterRemove; // truncate array
                    this.push.apply(this, insert);
                } else {
                    this.length = lengthAfterRemove + add; // reserves space
                    for (i = 0; i < add; ++i) {
                        this[pos+i] = insert[i];
                    }
                }
            }
            return removed;
        };
    }
}
if (!Array.isArray) {
    Array.isArray = function isArray(obj) {
        return _toString(obj) == "[object Array]";
    };
}
var boxedString = Object("a"),
    splitString = boxedString[0] != "a" || !(0 in boxedString);

if (!Array.prototype.forEach) {
    Array.prototype.forEach = function forEach(fun /*, thisp*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            thisp = arguments[1],
            i = -1,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }

        while (++i < length) {
            if (i in self) {
                fun.call(thisp, self[i], i, object);
            }
        }
    };
}
if (!Array.prototype.map) {
    Array.prototype.map = function map(fun /*, thisp*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            result = Array(length),
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self)
                result[i] = fun.call(thisp, self[i], i, object);
        }
        return result;
    };
}
if (!Array.prototype.filter) {
    Array.prototype.filter = function filter(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                    object,
            length = self.length >>> 0,
            result = [],
            value,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self) {
                value = self[i];
                if (fun.call(thisp, value, i, object)) {
                    result.push(value);
                }
            }
        }
        return result;
    };
}
if (!Array.prototype.every) {
    Array.prototype.every = function every(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self && !fun.call(thisp, self[i], i, object)) {
                return false;
            }
        }
        return true;
    };
}
if (!Array.prototype.some) {
    Array.prototype.some = function some(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self && fun.call(thisp, self[i], i, object)) {
                return true;
            }
        }
        return false;
    };
}
if (!Array.prototype.reduce) {
    Array.prototype.reduce = function reduce(fun /*, initial*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }
        if (!length && arguments.length == 1) {
            throw new TypeError("reduce of empty array with no initial value");
        }

        var i = 0;
        var result;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i++];
                    break;
                }
                if (++i >= length) {
                    throw new TypeError("reduce of empty array with no initial value");
                }
            } while (true);
        }

        for (; i < length; i++) {
            if (i in self) {
                result = fun.call(void 0, result, self[i], i, object);
            }
        }

        return result;
    };
}
if (!Array.prototype.reduceRight) {
    Array.prototype.reduceRight = function reduceRight(fun /*, initial*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }
        if (!length && arguments.length == 1) {
            throw new TypeError("reduceRight of empty array with no initial value");
        }

        var result, i = length - 1;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i--];
                    break;
                }
                if (--i < 0) {
                    throw new TypeError("reduceRight of empty array with no initial value");
                }
            } while (true);
        }

        do {
            if (i in this) {
                result = fun.call(void 0, result, self[i], i, object);
            }
        } while (i--);

        return result;
    };
}
if (!Array.prototype.indexOf || ([0, 1].indexOf(1, 2) != -1)) {
    Array.prototype.indexOf = function indexOf(sought /*, fromIndex */ ) {
        var self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                toObject(this),
            length = self.length >>> 0;

        if (!length) {
            return -1;
        }

        var i = 0;
        if (arguments.length > 1) {
            i = toInteger(arguments[1]);
        }
        i = i >= 0 ? i : Math.max(0, length + i);
        for (; i < length; i++) {
            if (i in self && self[i] === sought) {
                return i;
            }
        }
        return -1;
    };
}
if (!Array.prototype.lastIndexOf || ([0, 1].lastIndexOf(0, -3) != -1)) {
    Array.prototype.lastIndexOf = function lastIndexOf(sought /*, fromIndex */) {
        var self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                toObject(this),
            length = self.length >>> 0;

        if (!length) {
            return -1;
        }
        var i = length - 1;
        if (arguments.length > 1) {
            i = Math.min(i, toInteger(arguments[1]));
        }
        i = i >= 0 ? i : length - Math.abs(i);
        for (; i >= 0; i--) {
            if (i in self && sought === self[i]) {
                return i;
            }
        }
        return -1;
    };
}
if (!Object.getPrototypeOf) {
    Object.getPrototypeOf = function getPrototypeOf(object) {
        return object.__proto__ || (
            object.constructor ?
            object.constructor.prototype :
            prototypeOfObject
        );
    };
}
if (!Object.getOwnPropertyDescriptor) {
    var ERR_NON_OBJECT = "Object.getOwnPropertyDescriptor called on a " +
                         "non-object: ";
    Object.getOwnPropertyDescriptor = function getOwnPropertyDescriptor(object, property) {
        if ((typeof object != "object" && typeof object != "function") || object === null)
            throw new TypeError(ERR_NON_OBJECT + object);
        if (!owns(object, property))
            return;

        var descriptor, getter, setter;
        descriptor =  { enumerable: true, configurable: true };
        if (supportsAccessors) {
            var prototype = object.__proto__;
            object.__proto__ = prototypeOfObject;

            var getter = lookupGetter(object, property);
            var setter = lookupSetter(object, property);
            object.__proto__ = prototype;

            if (getter || setter) {
                if (getter) descriptor.get = getter;
                if (setter) descriptor.set = setter;
                return descriptor;
            }
        }
        descriptor.value = object[property];
        return descriptor;
    };
}
if (!Object.getOwnPropertyNames) {
    Object.getOwnPropertyNames = function getOwnPropertyNames(object) {
        return Object.keys(object);
    };
}
if (!Object.create) {
    var createEmpty;
    if (Object.prototype.__proto__ === null) {
        createEmpty = function () {
            return { "__proto__": null };
        };
    } else {
        createEmpty = function () {
            var empty = {};
            for (var i in empty)
                empty[i] = null;
            empty.constructor =
            empty.hasOwnProperty =
            empty.propertyIsEnumerable =
            empty.isPrototypeOf =
            empty.toLocaleString =
            empty.toString =
            empty.valueOf =
            empty.__proto__ = null;
            return empty;
        }
    }

    Object.create = function create(prototype, properties) {
        var object;
        if (prototype === null) {
            object = createEmpty();
        } else {
            if (typeof prototype != "object")
                throw new TypeError("typeof prototype["+(typeof prototype)+"] != 'object'");
            var Type = function () {};
            Type.prototype = prototype;
            object = new Type();
            object.__proto__ = prototype;
        }
        if (properties !== void 0)
            Object.defineProperties(object, properties);
        return object;
    };
}

function doesDefinePropertyWork(object) {
    try {
        Object.defineProperty(object, "sentinel", {});
        return "sentinel" in object;
    } catch (exception) {
    }
}
if (Object.defineProperty) {
    var definePropertyWorksOnObject = doesDefinePropertyWork({});
    var definePropertyWorksOnDom = typeof document == "undefined" ||
        doesDefinePropertyWork(document.createElement("div"));
    if (!definePropertyWorksOnObject || !definePropertyWorksOnDom) {
        var definePropertyFallback = Object.defineProperty;
    }
}

if (!Object.defineProperty || definePropertyFallback) {
    var ERR_NON_OBJECT_DESCRIPTOR = "Property description must be an object: ";
    var ERR_NON_OBJECT_TARGET = "Object.defineProperty called on non-object: "
    var ERR_ACCESSORS_NOT_SUPPORTED = "getters & setters can not be defined " +
                                      "on this javascript engine";

    Object.defineProperty = function defineProperty(object, property, descriptor) {
        if ((typeof object != "object" && typeof object != "function") || object === null)
            throw new TypeError(ERR_NON_OBJECT_TARGET + object);
        if ((typeof descriptor != "object" && typeof descriptor != "function") || descriptor === null)
            throw new TypeError(ERR_NON_OBJECT_DESCRIPTOR + descriptor);
        if (definePropertyFallback) {
            try {
                return definePropertyFallback.call(Object, object, property, descriptor);
            } catch (exception) {
            }
        }
        if (owns(descriptor, "value")) {

            if (supportsAccessors && (lookupGetter(object, property) ||
                                      lookupSetter(object, property)))
            {
                var prototype = object.__proto__;
                object.__proto__ = prototypeOfObject;
                delete object[property];
                object[property] = descriptor.value;
                object.__proto__ = prototype;
            } else {
                object[property] = descriptor.value;
            }
        } else {
            if (!supportsAccessors)
                throw new TypeError(ERR_ACCESSORS_NOT_SUPPORTED);
            if (owns(descriptor, "get"))
                defineGetter(object, property, descriptor.get);
            if (owns(descriptor, "set"))
                defineSetter(object, property, descriptor.set);
        }

        return object;
    };
}
if (!Object.defineProperties) {
    Object.defineProperties = function defineProperties(object, properties) {
        for (var property in properties) {
            if (owns(properties, property))
                Object.defineProperty(object, property, properties[property]);
        }
        return object;
    };
}
if (!Object.seal) {
    Object.seal = function seal(object) {
        return object;
    };
}
if (!Object.freeze) {
    Object.freeze = function freeze(object) {
        return object;
    };
}
try {
    Object.freeze(function () {});
} catch (exception) {
    Object.freeze = (function freeze(freezeObject) {
        return function freeze(object) {
            if (typeof object == "function") {
                return object;
            } else {
                return freezeObject(object);
            }
        };
    })(Object.freeze);
}
if (!Object.preventExtensions) {
    Object.preventExtensions = function preventExtensions(object) {
        return object;
    };
}
if (!Object.isSealed) {
    Object.isSealed = function isSealed(object) {
        return false;
    };
}
if (!Object.isFrozen) {
    Object.isFrozen = function isFrozen(object) {
        return false;
    };
}
if (!Object.isExtensible) {
    Object.isExtensible = function isExtensible(object) {
        if (Object(object) === object) {
            throw new TypeError(); // TODO message
        }
        var name = '';
        while (owns(object, name)) {
            name += '?';
        }
        object[name] = true;
        var returnValue = owns(object, name);
        delete object[name];
        return returnValue;
    };
}
if (!Object.keys) {
    var hasDontEnumBug = true,
        dontEnums = [
            "toString",
            "toLocaleString",
            "valueOf",
            "hasOwnProperty",
            "isPrototypeOf",
            "propertyIsEnumerable",
            "constructor"
        ],
        dontEnumsLength = dontEnums.length;

    for (var key in {"toString": null}) {
        hasDontEnumBug = false;
    }

    Object.keys = function keys(object) {

        if (
            (typeof object != "object" && typeof object != "function") ||
            object === null
        ) {
            throw new TypeError("Object.keys called on a non-object");
        }

        var keys = [];
        for (var name in object) {
            if (owns(object, name)) {
                keys.push(name);
            }
        }

        if (hasDontEnumBug) {
            for (var i = 0, ii = dontEnumsLength; i < ii; i++) {
                var dontEnum = dontEnums[i];
                if (owns(object, dontEnum)) {
                    keys.push(dontEnum);
                }
            }
        }
        return keys;
    };

}
if (!Date.now) {
    Date.now = function now() {
        return new Date().getTime();
    };
}
var ws = "\x09\x0A\x0B\x0C\x0D\x20\xA0\u1680\u180E\u2000\u2001\u2002\u2003" +
    "\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028" +
    "\u2029\uFEFF";
if (!String.prototype.trim || ws.trim()) {
    ws = "[" + ws + "]";
    var trimBeginRegexp = new RegExp("^" + ws + ws + "*"),
        trimEndRegexp = new RegExp(ws + ws + "*$");
    String.prototype.trim = function trim() {
        return String(this).replace(trimBeginRegexp, "").replace(trimEndRegexp, "");
    };
}

function toInteger(n) {
    n = +n;
    if (n !== n) { // isNaN
        n = 0;
    } else if (n !== 0 && n !== (1/0) && n !== -(1/0)) {
        n = (n > 0 || -1) * Math.floor(Math.abs(n));
    }
    return n;
}

function isPrimitive(input) {
    var type = typeof input;
    return (
        input === null ||
        type === "undefined" ||
        type === "boolean" ||
        type === "number" ||
        type === "string"
    );
}

function toPrimitive(input) {
    var val, valueOf, toString;
    if (isPrimitive(input)) {
        return input;
    }
    valueOf = input.valueOf;
    if (typeof valueOf === "function") {
        val = valueOf.call(input);
        if (isPrimitive(val)) {
            return val;
        }
    }
    toString = input.toString;
    if (typeof toString === "function") {
        val = toString.call(input);
        if (isPrimitive(val)) {
            return val;
        }
    }
    throw new TypeError();
}
var toObject = function (o) {
    if (o == null) { // this matches both null and undefined
        throw new TypeError("can't convert "+o+" to object");
    }
    return Object(o);
};

});
