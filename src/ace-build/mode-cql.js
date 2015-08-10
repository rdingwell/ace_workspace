define("ace/mode/matching_brace_outdent",["require","exports","module","ace/range"], function(require, exports, module) {
"use strict";

var Range = require("../range").Range;

var MatchingBraceOutdent = function() {};

(function() {

    this.checkOutdent = function(line, input) {
        if (! /^\s+$/.test(line))
            return false;

        return /^\s*\}/.test(input);
    };

    this.autoOutdent = function(doc, row) {
        var line = doc.getLine(row);
        var match = line.match(/^(\s*\})/);

        if (!match) return 0;

        var column = match[1].length;
        var openBracePos = doc.findMatchingBracket({row: row, column: column});

        if (!openBracePos || openBracePos.row == row) return 0;

        var indent = this.$getIndent(doc.getLine(openBracePos.row));
        doc.replace(new Range(row, 0, row, column-1), indent);
    };

    this.$getIndent = function(line) {
        return line.match(/^\s*/)[0];
    };

}).call(MatchingBraceOutdent.prototype);

exports.MatchingBraceOutdent = MatchingBraceOutdent;
});

define("ace/mode/cql_highlight_rules",["require","exports","module","ace/lib/oop","ace/mode/text_highlight_rules"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var CqlHighlightRules = function() {

 var keywords = (
            "library|version|using|include|called|public|private|parameter|default|valueset|"+
            "codesystems|List|Interval|Tuple|define|context|function|with|such|that|in|from|"+
            "where|return|all|distinct|sort|by|asc|ascending|desc|descending|not|is|as|cast|"+
            "exists|properly|between|and|difference|matches|contains|or|xor|union|intersect|"+
            "except|year|month|day|minute|hour|second|millisecond|date|time|timezone|years|"+
            "months|days|minutes|hours|seconds|milliseconds|convert|to|start|end|of|duration|"+
            "width|successor|predecessor|singleton|minimum|maximum|if|then|else|div|mod|case|"+
            "collapse|expand|when|then|before|after|more|less|occurs|same|included|overlaps|"+
            "display|Code|Concept|starts|ends"
        );

        var langConstant = (
            "true|false|null"
        );

        var keywordMapper = this.createKeywordMapper({
            "keyword": keywords,
            "constant.language": langConstant
        }, "identifier");

        var functionRule = {
            token: ["paren.lparen", "variable.parameter", "paren.rparen", "text", "storage.type"],
            regex: /(?:(\()((?:"[^")]*?"|'[^')]*?'|\/[^\/)]*?\/|[^()\"'\/])*?)(\))(\s*))?([\-=]>)/.source
        };

        var stringEscape = /\\(?:x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[0-2][0-7]{0,2}|3[0-6][0-7]?|37[0-7]?|[4-7][0-7]?|.)/;
        this.$rules = {
            "start" : [
                {token : "valueset", regex : /\"/, next  : "valueset"},
                {token : "string", regex : "'", next  : "qstring"},
                {token : "doc.comment", regex : /\/\*.+/, next: "comment"},
                {token : "comment",  regex : /\/\/.+$/},
                {token : "invalid", regex: "\\.{2,}"},
                {token : "keyword.operator", regex: /\W[\-+\%=<>*]\W|\*\*|[~:,\.&$]|->*?|=>/},
                {token : "paren.lparen", regex : "[\\[({]"},
                {token : "paren.rparen", regex : "[\\])}]"},
                {token : "constant.numeric", regex: "[+-]?\\d+\\b"},
                {token : "variable.parameter", regex : /sy|pa?\d\d\d\d\|t\d\d\d\.|innnn/}, 
                {token : "variable.parameter", regex : /\w+-\w+(?:-\w+)*/}, 
                {token : keywordMapper, regex : "\\b\\w+\\b"},
                {caseInsensitive: true}
            ],
            "qstring" : [
                {token : "constant.language.escape",   regex : "''"},
                {token : "string", regex : "'",     next  : "start"},
                {defaultToken : "string"}
            ],
            "valueset" : [

                {token : "constant.language.escape",   regex :/\\\"/},
                {token : "valueset", regex : /\"/,     next  : "start"},
                {defaultToken : "valueset"}
            ]
            ,
            "comment" : [
                {token : "doc.comment", regex : /\*\//,     next  : "start"},
                {defaultToken : "doc.comment"}

            ]
        };

      this.normalizeRules();
    }
oop.inherits(CqlHighlightRules, TextHighlightRules);
exports.CqlHighlightRules = CqlHighlightRules;

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

define("ace/mode/cql/model_manager",["require","exports","module","ace/config","ace/lib/net"], function(require, exports, module) {
  "use strict";
  var config = require("../../config");
  var net = require("../../lib/net");
   function ModelManager(){
    this.models = {};

  }
  ModelManager.prototype.constructor = ModelManager;
  ModelManager.prototype.loadModel = function(model){
    var self = this;
    net.get("./models/"+model+".json", function(m) {
      if (m) {
        self.models[model] = JSON.parse(m);
      }
    });
  }
  ModelManager.prototype.getModel = function(model) {
    //return [];
    if( !this.models[model]  ){
      this.loadModel(model);
    }
    return this.models[model] || [];
  }

  exports.ModelManager = new ModelManager();
});

define("ace/mode/cql/model_completer",["require","exports","module","ace/mode/cql/model_manager"], function(require, exports, module) {
"use strict";
 var ModelManager = require('./model_manager').ModelManager;
 var isRetrieve = function(session, pos){
  var row = pos.row;
  var column = pos.column
  var prev = null;
  var token = null;
  while( (token = session.getTokenAt(row,column)) ){
    if(prev && prev.column == 0) {return false}
    prev = token;  
    switch(token.type) {
      case "paren.lparen":
        return true;
        break;
      case "text" :
        if (token.value && token.value.trim && token.value.trim() == "" ){
          column = token.start;
        }else {
          return false;
        }
        break;  
      case "identifier":
        column = token.start 
        break;
      default:
        return false   
    }
  }
 }
  var cqlModelCompleter = {
    getCompletions: function(editor, session, pos, prefix, callback) {
      var cqlModel = session.cqlModel;
      var completions = [];
      if (!cqlModel || !cqlModel.data) {return }
      if (cqlModel.data.valuesets){
         callback(null, cqlModel.data.valuesets.map(function(m) {
          return {name: m, value: m, score: 0, meta: "Valueset"}
         }));
      }
      if ( cqlModel.data.models && isRetrieve(session,pos)) {
        for( var i in cqlModel.data.models){
          var mod = ModelManager.getModel(cqlModel.data.models[i]);
          if(mod && mod.types){
            callback(null, mod.types.map(function(m){
               return {name: cqlModel.data.models[i]+"."+m, value: cqlModel.data.models[i]+"."+m, score: 10, meta: cqlModel.data.models[i]}
            }));
          }
         }
      }
    }
  }
  exports.ModelCompleter = cqlModelCompleter;
});

define("ace/snippets",["require","exports","module","ace/lib/oop","ace/lib/event_emitter","ace/lib/lang","ace/range","ace/anchor","ace/keyboard/hash_handler","ace/tokenizer","ace/lib/dom","ace/editor"], function(require, exports, module) {
"use strict";
var oop = require("./lib/oop");
var EventEmitter = require("./lib/event_emitter").EventEmitter;
var lang = require("./lib/lang");
var Range = require("./range").Range;
var Anchor = require("./anchor").Anchor;
var HashHandler = require("./keyboard/hash_handler").HashHandler;
var Tokenizer = require("./tokenizer").Tokenizer;
var comparePoints = Range.comparePoints;

var SnippetManager = function() {
    this.snippetMap = {};
    this.snippetNameMap = {};
};

(function() {
    oop.implement(this, EventEmitter);
    
    this.getTokenizer = function() {
        function TabstopToken(str, _, stack) {
            str = str.substr(1);
            if (/^\d+$/.test(str) && !stack.inFormatString)
                return [{tabstopId: parseInt(str, 10)}];
            return [{text: str}];
        }
        function escape(ch) {
            return "(?:[^\\\\" + ch + "]|\\\\.)";
        }
        SnippetManager.$tokenizer = new Tokenizer({
            start: [
                {regex: /:/, onMatch: function(val, state, stack) {
                    if (stack.length && stack[0].expectIf) {
                        stack[0].expectIf = false;
                        stack[0].elseBranch = stack[0];
                        return [stack[0]];
                    }
                    return ":";
                }},
                {regex: /\\./, onMatch: function(val, state, stack) {
                    var ch = val[1];
                    if (ch == "}" && stack.length) {
                        val = ch;
                    }else if ("`$\\".indexOf(ch) != -1) {
                        val = ch;
                    } else if (stack.inFormatString) {
                        if (ch == "n")
                            val = "\n";
                        else if (ch == "t")
                            val = "\n";
                        else if ("ulULE".indexOf(ch) != -1) {
                            val = {changeCase: ch, local: ch > "a"};
                        }
                    }

                    return [val];
                }},
                {regex: /}/, onMatch: function(val, state, stack) {
                    return [stack.length ? stack.shift() : val];
                }},
                {regex: /\$(?:\d+|\w+)/, onMatch: TabstopToken},
                {regex: /\$\{[\dA-Z_a-z]+/, onMatch: function(str, state, stack) {
                    var t = TabstopToken(str.substr(1), state, stack);
                    stack.unshift(t[0]);
                    return t;
                }, next: "snippetVar"},
                {regex: /\n/, token: "newline", merge: false}
            ],
            snippetVar: [
                {regex: "\\|" + escape("\\|") + "*\\|", onMatch: function(val, state, stack) {
                    stack[0].choices = val.slice(1, -1).split(",");
                }, next: "start"},
                {regex: "/(" + escape("/") + "+)/(?:(" + escape("/") + "*)/)(\\w*):?",
                 onMatch: function(val, state, stack) {
                    var ts = stack[0];
                    ts.fmtString = val;

                    val = this.splitRegex.exec(val);
                    ts.guard = val[1];
                    ts.fmt = val[2];
                    ts.flag = val[3];
                    return "";
                }, next: "start"},
                {regex: "`" + escape("`") + "*`", onMatch: function(val, state, stack) {
                    stack[0].code = val.splice(1, -1);
                    return "";
                }, next: "start"},
                {regex: "\\?", onMatch: function(val, state, stack) {
                    if (stack[0])
                        stack[0].expectIf = true;
                }, next: "start"},
                {regex: "([^:}\\\\]|\\\\.)*:?", token: "", next: "start"}
            ],
            formatString: [
                {regex: "/(" + escape("/") + "+)/", token: "regex"},
                {regex: "", onMatch: function(val, state, stack) {
                    stack.inFormatString = true;
                }, next: "start"}
            ]
        });
        SnippetManager.prototype.getTokenizer = function() {
            return SnippetManager.$tokenizer;
        };
        return SnippetManager.$tokenizer;
    };

    this.tokenizeTmSnippet = function(str, startState) {
        return this.getTokenizer().getLineTokens(str, startState).tokens.map(function(x) {
            return x.value || x;
        });
    };

    this.$getDefaultValue = function(editor, name) {
        if (/^[A-Z]\d+$/.test(name)) {
            var i = name.substr(1);
            return (this.variables[name[0] + "__"] || {})[i];
        }
        if (/^\d+$/.test(name)) {
            return (this.variables.__ || {})[name];
        }
        name = name.replace(/^TM_/, "");

        if (!editor)
            return;
        var s = editor.session;
        switch(name) {
            case "CURRENT_WORD":
                var r = s.getWordRange();
            case "SELECTION":
            case "SELECTED_TEXT":
                return s.getTextRange(r);
            case "CURRENT_LINE":
                return s.getLine(editor.getCursorPosition().row);
            case "PREV_LINE": // not possible in textmate
                return s.getLine(editor.getCursorPosition().row - 1);
            case "LINE_INDEX":
                return editor.getCursorPosition().column;
            case "LINE_NUMBER":
                return editor.getCursorPosition().row + 1;
            case "SOFT_TABS":
                return s.getUseSoftTabs() ? "YES" : "NO";
            case "TAB_SIZE":
                return s.getTabSize();
            case "FILENAME":
            case "FILEPATH":
                return "";
            case "FULLNAME":
                return "Ace";
        }
    };
    this.variables = {};
    this.getVariableValue = function(editor, varName) {
        if (this.variables.hasOwnProperty(varName))
            return this.variables[varName](editor, varName) || "";
        return this.$getDefaultValue(editor, varName) || "";
    };
    this.tmStrFormat = function(str, ch, editor) {
        var flag = ch.flag || "";
        var re = ch.guard;
        re = new RegExp(re, flag.replace(/[^gi]/, ""));
        var fmtTokens = this.tokenizeTmSnippet(ch.fmt, "formatString");
        var _self = this;
        var formatted = str.replace(re, function() {
            _self.variables.__ = arguments;
            var fmtParts = _self.resolveVariables(fmtTokens, editor);
            var gChangeCase = "E";
            for (var i  = 0; i < fmtParts.length; i++) {
                var ch = fmtParts[i];
                if (typeof ch == "object") {
                    fmtParts[i] = "";
                    if (ch.changeCase && ch.local) {
                        var next = fmtParts[i + 1];
                        if (next && typeof next == "string") {
                            if (ch.changeCase == "u")
                                fmtParts[i] = next[0].toUpperCase();
                            else
                                fmtParts[i] = next[0].toLowerCase();
                            fmtParts[i + 1] = next.substr(1);
                        }
                    } else if (ch.changeCase) {
                        gChangeCase = ch.changeCase;
                    }
                } else if (gChangeCase == "U") {
                    fmtParts[i] = ch.toUpperCase();
                } else if (gChangeCase == "L") {
                    fmtParts[i] = ch.toLowerCase();
                }
            }
            return fmtParts.join("");
        });
        this.variables.__ = null;
        return formatted;
    };

    this.resolveVariables = function(snippet, editor) {
        var result = [];
        for (var i = 0; i < snippet.length; i++) {
            var ch = snippet[i];
            if (typeof ch == "string") {
                result.push(ch);
            } else if (typeof ch != "object") {
                continue;
            } else if (ch.skip) {
                gotoNext(ch);
            } else if (ch.processed < i) {
                continue;
            } else if (ch.text) {
                var value = this.getVariableValue(editor, ch.text);
                if (value && ch.fmtString)
                    value = this.tmStrFormat(value, ch);
                ch.processed = i;
                if (ch.expectIf == null) {
                    if (value) {
                        result.push(value);
                        gotoNext(ch);
                    }
                } else {
                    if (value) {
                        ch.skip = ch.elseBranch;
                    } else
                        gotoNext(ch);
                }
            } else if (ch.tabstopId != null) {
                result.push(ch);
            } else if (ch.changeCase != null) {
                result.push(ch);
            }
        }
        function gotoNext(ch) {
            var i1 = snippet.indexOf(ch, i + 1);
            if (i1 != -1)
                i = i1;
        }
        return result;
    };

    this.insertSnippetForSelection = function(editor, snippetText) {
        var cursor = editor.getCursorPosition();
        var line = editor.session.getLine(cursor.row);
        var tabString = editor.session.getTabString();
        var indentString = line.match(/^\s*/)[0];
        
        if (cursor.column < indentString.length)
            indentString = indentString.slice(0, cursor.column);

        var tokens = this.tokenizeTmSnippet(snippetText);
        tokens = this.resolveVariables(tokens, editor);
        tokens = tokens.map(function(x) {
            if (x == "\n")
                return x + indentString;
            if (typeof x == "string")
                return x.replace(/\t/g, tabString);
            return x;
        });
        var tabstops = [];
        tokens.forEach(function(p, i) {
            if (typeof p != "object")
                return;
            var id = p.tabstopId;
            var ts = tabstops[id];
            if (!ts) {
                ts = tabstops[id] = [];
                ts.index = id;
                ts.value = "";
            }
            if (ts.indexOf(p) !== -1)
                return;
            ts.push(p);
            var i1 = tokens.indexOf(p, i + 1);
            if (i1 === -1)
                return;

            var value = tokens.slice(i + 1, i1);
            var isNested = value.some(function(t) {return typeof t === "object"});          
            if (isNested && !ts.value) {
                ts.value = value;
            } else if (value.length && (!ts.value || typeof ts.value !== "string")) {
                ts.value = value.join("");
            }
        });
        tabstops.forEach(function(ts) {ts.length = 0});
        var expanding = {};
        function copyValue(val) {
            var copy = [];
            for (var i = 0; i < val.length; i++) {
                var p = val[i];
                if (typeof p == "object") {
                    if (expanding[p.tabstopId])
                        continue;
                    var j = val.lastIndexOf(p, i - 1);
                    p = copy[j] || {tabstopId: p.tabstopId};
                }
                copy[i] = p;
            }
            return copy;
        }
        for (var i = 0; i < tokens.length; i++) {
            var p = tokens[i];
            if (typeof p != "object")
                continue;
            var id = p.tabstopId;
            var i1 = tokens.indexOf(p, i + 1);
            if (expanding[id]) {
                if (expanding[id] === p)
                    expanding[id] = null;
                continue;
            }
            
            var ts = tabstops[id];
            var arg = typeof ts.value == "string" ? [ts.value] : copyValue(ts.value);
            arg.unshift(i + 1, Math.max(0, i1 - i));
            arg.push(p);
            expanding[id] = p;
            tokens.splice.apply(tokens, arg);

            if (ts.indexOf(p) === -1)
                ts.push(p);
        }
        var row = 0, column = 0;
        var text = "";
        tokens.forEach(function(t) {
            if (typeof t === "string") {
                if (t[0] === "\n"){
                    column = t.length - 1;
                    row ++;
                } else
                    column += t.length;
                text += t;
            } else {
                if (!t.start)
                    t.start = {row: row, column: column};
                else
                    t.end = {row: row, column: column};
            }
        });
        var range = editor.getSelectionRange();
        var end = editor.session.replace(range, text);

        var tabstopManager = new TabstopManager(editor);
        var selectionId = editor.inVirtualSelectionMode && editor.selection.index;
        tabstopManager.addTabstops(tabstops, range.start, end, selectionId);
    };
    
    this.insertSnippet = function(editor, snippetText) {
        var self = this;
        if (editor.inVirtualSelectionMode)
            return self.insertSnippetForSelection(editor, snippetText);
        
        editor.forEachSelection(function() {
            self.insertSnippetForSelection(editor, snippetText);
        }, null, {keepOrder: true});
        
        if (editor.tabstopManager)
            editor.tabstopManager.tabNext();
    };

    this.$getScope = function(editor) {
        var scope = editor.session.$mode.$id || "";
        scope = scope.split("/").pop();
        if (scope === "html" || scope === "php") {
            if (scope === "php" && !editor.session.$mode.inlinePhp) 
                scope = "html";
            var c = editor.getCursorPosition();
            var state = editor.session.getState(c.row);
            if (typeof state === "object") {
                state = state[0];
            }
            if (state.substring) {
                if (state.substring(0, 3) == "js-")
                    scope = "javascript";
                else if (state.substring(0, 4) == "css-")
                    scope = "css";
                else if (state.substring(0, 4) == "php-")
                    scope = "php";
            }
        }
        
        return scope;
    };

    this.getActiveScopes = function(editor) {
        var scope = this.$getScope(editor);
        var scopes = [scope];
        var snippetMap = this.snippetMap;
        if (snippetMap[scope] && snippetMap[scope].includeScopes) {
            scopes.push.apply(scopes, snippetMap[scope].includeScopes);
        }
        scopes.push("_");
        return scopes;
    };

    this.expandWithTab = function(editor, options) {
        var self = this;
        var result = editor.forEachSelection(function() {
            return self.expandSnippetForSelection(editor, options);
        }, null, {keepOrder: true});
        if (result && editor.tabstopManager)
            editor.tabstopManager.tabNext();
        return result;
    };
    
    this.expandSnippetForSelection = function(editor, options) {
        var cursor = editor.getCursorPosition();
        var line = editor.session.getLine(cursor.row);
        var before = line.substring(0, cursor.column);
        var after = line.substr(cursor.column);

        var snippetMap = this.snippetMap;
        var snippet;
        this.getActiveScopes(editor).some(function(scope) {
            var snippets = snippetMap[scope];
            if (snippets)
                snippet = this.findMatchingSnippet(snippets, before, after);
            return !!snippet;
        }, this);
        if (!snippet)
            return false;
        if (options && options.dryRun)
            return true;
        editor.session.doc.removeInLine(cursor.row,
            cursor.column - snippet.replaceBefore.length,
            cursor.column + snippet.replaceAfter.length
        );

        this.variables.M__ = snippet.matchBefore;
        this.variables.T__ = snippet.matchAfter;
        this.insertSnippetForSelection(editor, snippet.content);

        this.variables.M__ = this.variables.T__ = null;
        return true;
    };

    this.findMatchingSnippet = function(snippetList, before, after) {
        for (var i = snippetList.length; i--;) {
            var s = snippetList[i];
            if (s.startRe && !s.startRe.test(before))
                continue;
            if (s.endRe && !s.endRe.test(after))
                continue;
            if (!s.startRe && !s.endRe)
                continue;

            s.matchBefore = s.startRe ? s.startRe.exec(before) : [""];
            s.matchAfter = s.endRe ? s.endRe.exec(after) : [""];
            s.replaceBefore = s.triggerRe ? s.triggerRe.exec(before)[0] : "";
            s.replaceAfter = s.endTriggerRe ? s.endTriggerRe.exec(after)[0] : "";
            return s;
        }
    };

    this.snippetMap = {};
    this.snippetNameMap = {};
    this.register = function(snippets, scope) {
        var snippetMap = this.snippetMap;
        var snippetNameMap = this.snippetNameMap;
        var self = this;
        
        if (!snippets) 
            snippets = [];
        
        function wrapRegexp(src) {
            if (src && !/^\^?\(.*\)\$?$|^\\b$/.test(src))
                src = "(?:" + src + ")";

            return src || "";
        }
        function guardedRegexp(re, guard, opening) {
            re = wrapRegexp(re);
            guard = wrapRegexp(guard);
            if (opening) {
                re = guard + re;
                if (re && re[re.length - 1] != "$")
                    re = re + "$";
            } else {
                re = re + guard;
                if (re && re[0] != "^")
                    re = "^" + re;
            }
            return new RegExp(re);
        }

        function addSnippet(s) {
            if (!s.scope)
                s.scope = scope || "_";
            scope = s.scope;
            if (!snippetMap[scope]) {
                snippetMap[scope] = [];
                snippetNameMap[scope] = {};
            }

            var map = snippetNameMap[scope];
            if (s.name) {
                var old = map[s.name];
                if (old)
                    self.unregister(old);
                map[s.name] = s;
            }
            snippetMap[scope].push(s);

            if (s.tabTrigger && !s.trigger) {
                if (!s.guard && /^\w/.test(s.tabTrigger))
                    s.guard = "\\b";
                s.trigger = lang.escapeRegExp(s.tabTrigger);
            }

            s.startRe = guardedRegexp(s.trigger, s.guard, true);
            s.triggerRe = new RegExp(s.trigger, "", true);

            s.endRe = guardedRegexp(s.endTrigger, s.endGuard, true);
            s.endTriggerRe = new RegExp(s.endTrigger, "", true);
        }

        if (snippets && snippets.content)
            addSnippet(snippets);
        else if (Array.isArray(snippets))
            snippets.forEach(addSnippet);
        
        this._signal("registerSnippets", {scope: scope});
    };
    this.unregister = function(snippets, scope) {
        var snippetMap = this.snippetMap;
        var snippetNameMap = this.snippetNameMap;

        function removeSnippet(s) {
            var nameMap = snippetNameMap[s.scope||scope];
            if (nameMap && nameMap[s.name]) {
                delete nameMap[s.name];
                var map = snippetMap[s.scope||scope];
                var i = map && map.indexOf(s);
                if (i >= 0)
                    map.splice(i, 1);
            }
        }
        if (snippets.content)
            removeSnippet(snippets);
        else if (Array.isArray(snippets))
            snippets.forEach(removeSnippet);
    };
    this.parseSnippetFile = function(str) {
        str = str.replace(/\r/g, "");
        var list = [], snippet = {};
        var re = /^#.*|^({[\s\S]*})\s*$|^(\S+) (.*)$|^((?:\n*\t.*)+)/gm;
        var m;
        while (m = re.exec(str)) {
            if (m[1]) {
                try {
                    snippet = JSON.parse(m[1]);
                    list.push(snippet);
                } catch (e) {}
            } if (m[4]) {
                snippet.content = m[4].replace(/^\t/gm, "");
                list.push(snippet);
                snippet = {};
            } else {
                var key = m[2], val = m[3];
                if (key == "regex") {
                    var guardRe = /\/((?:[^\/\\]|\\.)*)|$/g;
                    snippet.guard = guardRe.exec(val)[1];
                    snippet.trigger = guardRe.exec(val)[1];
                    snippet.endTrigger = guardRe.exec(val)[1];
                    snippet.endGuard = guardRe.exec(val)[1];
                } else if (key == "snippet") {
                    snippet.tabTrigger = val.match(/^\S*/)[0];
                    if (!snippet.name)
                        snippet.name = val;
                } else {
                    snippet[key] = val;
                }
            }
        }
        return list;
    };
    this.getSnippetByName = function(name, editor) {
        var snippetMap = this.snippetNameMap;
        var snippet;
        this.getActiveScopes(editor).some(function(scope) {
            var snippets = snippetMap[scope];
            if (snippets)
                snippet = snippets[name];
            return !!snippet;
        }, this);
        return snippet;
    };

}).call(SnippetManager.prototype);


var TabstopManager = function(editor) {
    if (editor.tabstopManager)
        return editor.tabstopManager;
    editor.tabstopManager = this;
    this.$onChange = this.onChange.bind(this);
    this.$onChangeSelection = lang.delayedCall(this.onChangeSelection.bind(this)).schedule;
    this.$onChangeSession = this.onChangeSession.bind(this);
    this.$onAfterExec = this.onAfterExec.bind(this);
    this.attach(editor);
};
(function() {
    this.attach = function(editor) {
        this.index = 0;
        this.ranges = [];
        this.tabstops = [];
        this.$openTabstops = null;
        this.selectedTabstop = null;

        this.editor = editor;
        this.editor.on("change", this.$onChange);
        this.editor.on("changeSelection", this.$onChangeSelection);
        this.editor.on("changeSession", this.$onChangeSession);
        this.editor.commands.on("afterExec", this.$onAfterExec);
        this.editor.keyBinding.addKeyboardHandler(this.keyboardHandler);
    };
    this.detach = function() {
        this.tabstops.forEach(this.removeTabstopMarkers, this);
        this.ranges = null;
        this.tabstops = null;
        this.selectedTabstop = null;
        this.editor.removeListener("change", this.$onChange);
        this.editor.removeListener("changeSelection", this.$onChangeSelection);
        this.editor.removeListener("changeSession", this.$onChangeSession);
        this.editor.commands.removeListener("afterExec", this.$onAfterExec);
        this.editor.keyBinding.removeKeyboardHandler(this.keyboardHandler);
        this.editor.tabstopManager = null;
        this.editor = null;
    };

    this.onChange = function(e) {
        var changeRange = e.data.range;
        var isRemove = e.data.action[0] == "r";
        var start = changeRange.start;
        var end = changeRange.end;
        var startRow = start.row;
        var endRow = end.row;
        var lineDif = endRow - startRow;
        var colDiff = end.column - start.column;

        if (isRemove) {
            lineDif = -lineDif;
            colDiff = -colDiff;
        }
        if (!this.$inChange && isRemove) {
            var ts = this.selectedTabstop;
            var changedOutside = ts && !ts.some(function(r) {
                return comparePoints(r.start, start) <= 0 && comparePoints(r.end, end) >= 0;
            });
            if (changedOutside)
                return this.detach();
        }
        var ranges = this.ranges;
        for (var i = 0; i < ranges.length; i++) {
            var r = ranges[i];
            if (r.end.row < start.row)
                continue;

            if (isRemove && comparePoints(start, r.start) < 0 && comparePoints(end, r.end) > 0) {
                this.removeRange(r);
                i--;
                continue;
            }

            if (r.start.row == startRow && r.start.column > start.column)
                r.start.column += colDiff;
            if (r.end.row == startRow && r.end.column >= start.column)
                r.end.column += colDiff;
            if (r.start.row >= startRow)
                r.start.row += lineDif;
            if (r.end.row >= startRow)
                r.end.row += lineDif;

            if (comparePoints(r.start, r.end) > 0)
                this.removeRange(r);
        }
        if (!ranges.length)
            this.detach();
    };
    this.updateLinkedFields = function() {
        var ts = this.selectedTabstop;
        if (!ts || !ts.hasLinkedRanges)
            return;
        this.$inChange = true;
        var session = this.editor.session;
        var text = session.getTextRange(ts.firstNonLinked);
        for (var i = ts.length; i--;) {
            var range = ts[i];
            if (!range.linked)
                continue;
            var fmt = exports.snippetManager.tmStrFormat(text, range.original);
            session.replace(range, fmt);
        }
        this.$inChange = false;
    };
    this.onAfterExec = function(e) {
        if (e.command && !e.command.readOnly)
            this.updateLinkedFields();
    };
    this.onChangeSelection = function() {
        if (!this.editor)
            return;
        var lead = this.editor.selection.lead;
        var anchor = this.editor.selection.anchor;
        var isEmpty = this.editor.selection.isEmpty();
        for (var i = this.ranges.length; i--;) {
            if (this.ranges[i].linked)
                continue;
            var containsLead = this.ranges[i].contains(lead.row, lead.column);
            var containsAnchor = isEmpty || this.ranges[i].contains(anchor.row, anchor.column);
            if (containsLead && containsAnchor)
                return;
        }
        this.detach();
    };
    this.onChangeSession = function() {
        this.detach();
    };
    this.tabNext = function(dir) {
        var max = this.tabstops.length;
        var index = this.index + (dir || 1);
        index = Math.min(Math.max(index, 1), max);
        if (index == max)
            index = 0;
        this.selectTabstop(index);
        if (index === 0)
            this.detach();
    };
    this.selectTabstop = function(index) {
        this.$openTabstops = null;
        var ts = this.tabstops[this.index];
        if (ts)
            this.addTabstopMarkers(ts);
        this.index = index;
        ts = this.tabstops[this.index];
        if (!ts || !ts.length)
            return;
        
        this.selectedTabstop = ts;
        if (!this.editor.inVirtualSelectionMode) {        
            var sel = this.editor.multiSelect;
            sel.toSingleRange(ts.firstNonLinked.clone());
            for (var i = ts.length; i--;) {
                if (ts.hasLinkedRanges && ts[i].linked)
                    continue;
                sel.addRange(ts[i].clone(), true);
            }
            if (sel.ranges[0])
                sel.addRange(sel.ranges[0].clone());
        } else {
            this.editor.selection.setRange(ts.firstNonLinked);
        }
        
        this.editor.keyBinding.addKeyboardHandler(this.keyboardHandler);
    };
    this.addTabstops = function(tabstops, start, end) {
        if (!this.$openTabstops)
            this.$openTabstops = [];
        if (!tabstops[0]) {
            var p = Range.fromPoints(end, end);
            moveRelative(p.start, start);
            moveRelative(p.end, start);
            tabstops[0] = [p];
            tabstops[0].index = 0;
        }

        var i = this.index;
        var arg = [i + 1, 0];
        var ranges = this.ranges;
        tabstops.forEach(function(ts, index) {
            var dest = this.$openTabstops[index] || ts;
                
            for (var i = ts.length; i--;) {
                var p = ts[i];
                var range = Range.fromPoints(p.start, p.end || p.start);
                movePoint(range.start, start);
                movePoint(range.end, start);
                range.original = p;
                range.tabstop = dest;
                ranges.push(range);
                if (dest != ts)
                    dest.unshift(range);
                else
                    dest[i] = range;
                if (p.fmtString) {
                    range.linked = true;
                    dest.hasLinkedRanges = true;
                } else if (!dest.firstNonLinked)
                    dest.firstNonLinked = range;
            }
            if (!dest.firstNonLinked)
                dest.hasLinkedRanges = false;
            if (dest === ts) {
                arg.push(dest);
                this.$openTabstops[index] = dest;
            }
            this.addTabstopMarkers(dest);
        }, this);
        
        if (arg.length > 2) {
            if (this.tabstops.length)
                arg.push(arg.splice(2, 1)[0]);
            this.tabstops.splice.apply(this.tabstops, arg);
        }
    };

    this.addTabstopMarkers = function(ts) {
        var session = this.editor.session;
        ts.forEach(function(range) {
            if  (!range.markerId)
                range.markerId = session.addMarker(range, "ace_snippet-marker", "text");
        });
    };
    this.removeTabstopMarkers = function(ts) {
        var session = this.editor.session;
        ts.forEach(function(range) {
            session.removeMarker(range.markerId);
            range.markerId = null;
        });
    };
    this.removeRange = function(range) {
        var i = range.tabstop.indexOf(range);
        range.tabstop.splice(i, 1);
        i = this.ranges.indexOf(range);
        this.ranges.splice(i, 1);
        this.editor.session.removeMarker(range.markerId);
        if (!range.tabstop.length) {
            i = this.tabstops.indexOf(range.tabstop);
            if (i != -1)
                this.tabstops.splice(i, 1);
            if (!this.tabstops.length)
                this.detach();
        }
    };

    this.keyboardHandler = new HashHandler();
    this.keyboardHandler.bindKeys({
        "Tab": function(ed) {
            if (exports.snippetManager && exports.snippetManager.expandWithTab(ed)) {
                return;
            }

            ed.tabstopManager.tabNext(1);
        },
        "Shift-Tab": function(ed) {
            ed.tabstopManager.tabNext(-1);
        },
        "Esc": function(ed) {
            ed.tabstopManager.detach();
        },
        "Return": function(ed) {
            return false;
        }
    });
}).call(TabstopManager.prototype);



var changeTracker = {};
changeTracker.onChange = Anchor.prototype.onChange;
changeTracker.setPosition = function(row, column) {
    this.pos.row = row;
    this.pos.column = column;
};
changeTracker.update = function(pos, delta, $insertRight) {
    this.$insertRight = $insertRight;
    this.pos = pos; 
    this.onChange(delta);
};

var movePoint = function(point, diff) {
    if (point.row == 0)
        point.column += diff.column;
    point.row += diff.row;
};

var moveRelative = function(point, start) {
    if (point.row == start.row)
        point.column -= start.column;
    point.row -= start.row;
};


require("./lib/dom").importCssString("\
.ace_snippet-marker {\
    -moz-box-sizing: border-box;\
    box-sizing: border-box;\
    background: rgba(194, 193, 208, 0.09);\
    border: 1px dotted rgba(211, 208, 235, 0.62);\
    position: absolute;\
}");

exports.snippetManager = new SnippetManager();


var Editor = require("./editor").Editor;
(function() {
    this.insertSnippet = function(content, options) {
        return exports.snippetManager.insertSnippet(this, content, options);
    };
    this.expandSnippet = function(options) {
        return exports.snippetManager.expandWithTab(this, options);
    };
}).call(Editor.prototype);

});

define("ace/autocomplete/popup",["require","exports","module","ace/edit_session","ace/virtual_renderer","ace/editor","ace/range","ace/lib/event","ace/lib/lang","ace/lib/dom"], function(require, exports, module) {
"use strict";

var EditSession = require("../edit_session").EditSession;
var Renderer = require("../virtual_renderer").VirtualRenderer;
var Editor = require("../editor").Editor;
var Range = require("../range").Range;
var event = require("../lib/event");
var lang = require("../lib/lang");
var dom = require("../lib/dom");

var $singleLineEditor = function(el) {
    var renderer = new Renderer(el);

    renderer.$maxLines = 4;

    var editor = new Editor(renderer);

    editor.setHighlightActiveLine(false);
    editor.setShowPrintMargin(false);
    editor.renderer.setShowGutter(false);
    editor.renderer.setHighlightGutterLine(false);

    editor.$mouseHandler.$focusWaitTimout = 0;
    editor.$highlightTagPending = true;

    return editor;
};

var AcePopup = function(parentNode) {
    var el = dom.createElement("div");
    var popup = new $singleLineEditor(el);

    if (parentNode)
        parentNode.appendChild(el);
    el.style.display = "none";
    popup.renderer.content.style.cursor = "default";
    popup.renderer.setStyle("ace_autocomplete");

    popup.setOption("displayIndentGuides", false);
    popup.setOption("dragDelay", 150);

    var noop = function(){};

    popup.focus = noop;
    popup.$isFocused = true;

    popup.renderer.$cursorLayer.restartTimer = noop;
    popup.renderer.$cursorLayer.element.style.opacity = 0;

    popup.renderer.$maxLines = 8;
    popup.renderer.$keepTextAreaAtCursor = false;

    popup.setHighlightActiveLine(false);
    popup.session.highlight("");
    popup.session.$searchHighlight.clazz = "ace_highlight-marker";

    popup.on("mousedown", function(e) {
        var pos = e.getDocumentPosition();
        popup.selection.moveToPosition(pos);
        selectionMarker.start.row = selectionMarker.end.row = pos.row;
        e.stop();
    });

    var lastMouseEvent;
    var hoverMarker = new Range(-1,0,-1,Infinity);
    var selectionMarker = new Range(-1,0,-1,Infinity);
    selectionMarker.id = popup.session.addMarker(selectionMarker, "ace_active-line", "fullLine");
    popup.setSelectOnHover = function(val) {
        if (!val) {
            hoverMarker.id = popup.session.addMarker(hoverMarker, "ace_line-hover", "fullLine");
        } else if (hoverMarker.id) {
            popup.session.removeMarker(hoverMarker.id);
            hoverMarker.id = null;
        }
    };
    popup.setSelectOnHover(false);
    popup.on("mousemove", function(e) {
        if (!lastMouseEvent) {
            lastMouseEvent = e;
            return;
        }
        if (lastMouseEvent.x == e.x && lastMouseEvent.y == e.y) {
            return;
        }
        lastMouseEvent = e;
        lastMouseEvent.scrollTop = popup.renderer.scrollTop;
        var row = lastMouseEvent.getDocumentPosition().row;
        if (hoverMarker.start.row != row) {
            if (!hoverMarker.id)
                popup.setRow(row);
            setHoverMarker(row);
        }
    });
    popup.renderer.on("beforeRender", function() {
        if (lastMouseEvent && hoverMarker.start.row != -1) {
            lastMouseEvent.$pos = null;
            var row = lastMouseEvent.getDocumentPosition().row;
            if (!hoverMarker.id)
                popup.setRow(row);
            setHoverMarker(row, true);
        }
    });
    popup.renderer.on("afterRender", function() {
        var row = popup.getRow();
        var t = popup.renderer.$textLayer;
        var selected = t.element.childNodes[row - t.config.firstRow];
        if (selected == t.selectedNode)
            return;
        if (t.selectedNode)
            dom.removeCssClass(t.selectedNode, "ace_selected");
        t.selectedNode = selected;
        if (selected)
            dom.addCssClass(selected, "ace_selected");
    });
    var hideHoverMarker = function() { setHoverMarker(-1) };
    var setHoverMarker = function(row, suppressRedraw) {
        if (row !== hoverMarker.start.row) {
            hoverMarker.start.row = hoverMarker.end.row = row;
            if (!suppressRedraw)
                popup.session._emit("changeBackMarker");
            popup._emit("changeHoverMarker");
        }
    };
    popup.getHoveredRow = function() {
        return hoverMarker.start.row;
    };

    event.addListener(popup.container, "mouseout", hideHoverMarker);
    popup.on("hide", hideHoverMarker);
    popup.on("changeSelection", hideHoverMarker);

    popup.session.doc.getLength = function() {
        return popup.data.length;
    };
    popup.session.doc.getLine = function(i) {
        var data = popup.data[i];
        if (typeof data == "string")
            return data;
        return (data && data.value) || "";
    };

    var bgTokenizer = popup.session.bgTokenizer;
    bgTokenizer.$tokenizeRow = function(row) {
        var data = popup.data[row];
        var tokens = [];
        if (!data)
            return tokens;
        if (typeof data == "string")
            data = {value: data};
        if (!data.caption)
            data.caption = data.value || data.name;

        var last = -1;
        var flag, c;
        for (var i = 0; i < data.caption.length; i++) {
            c = data.caption[i];
            flag = data.matchMask & (1 << i) ? 1 : 0;
            if (last !== flag) {
                tokens.push({type: data.className || "" + ( flag ? "completion-highlight" : ""), value: c});
                last = flag;
            } else {
                tokens[tokens.length - 1].value += c;
            }
        }

        if (data.meta) {
            var maxW = popup.renderer.$size.scrollerWidth / popup.renderer.layerConfig.characterWidth;
            var metaData = data.meta;
            if (metaData.length + data.caption.length > maxW - 2) {
                metaData = metaData.substr(0, maxW - data.caption.length - 3) + "\u2026"
            }
            tokens.push({type: "rightAlignedText", value: metaData});
        }
        return tokens;
    };
    bgTokenizer.$updateOnChange = noop;
    bgTokenizer.start = noop;

    popup.session.$computeWidth = function() {
        return this.screenWidth = 0;
    };

    popup.$blockScrolling = Infinity;
    popup.isOpen = false;
    popup.isTopdown = false;

    popup.data = [];
    popup.setData = function(list) {
        popup.data = list || [];
        popup.setValue(lang.stringRepeat("\n", list.length), -1);
        popup.setRow(0);
    };
    popup.getData = function(row) {
        return popup.data[row];
    };

    popup.getRow = function() {
        return selectionMarker.start.row;
    };
    popup.setRow = function(line) {
        line = Math.max(-1, Math.min(this.data.length, line));
        if (selectionMarker.start.row != line) {
            popup.selection.clearSelection();
            selectionMarker.start.row = selectionMarker.end.row = line || 0;
            popup.session._emit("changeBackMarker");
            popup.moveCursorTo(line || 0, 0);
            if (popup.isOpen)
                popup._signal("select");
        }
    };

    popup.on("changeSelection", function() {
        if (popup.isOpen)
            popup.setRow(popup.selection.lead.row);
        popup.renderer.scrollCursorIntoView();
    });

    popup.hide = function() {
        this.container.style.display = "none";
        this._signal("hide");
        popup.isOpen = false;
    };
    popup.show = function(pos, lineHeight, topdownOnly) {
        var el = this.container;
        var screenHeight = window.innerHeight;
        var screenWidth = window.innerWidth;
        var renderer = this.renderer;
        var maxH = renderer.$maxLines * lineHeight * 1.4;
        var top = pos.top + this.$borderSize;
        if (top + maxH > screenHeight - lineHeight && !topdownOnly) {
            el.style.top = "";
            el.style.bottom = screenHeight - top + "px";
            popup.isTopdown = false;
        } else {
            top += lineHeight;
            el.style.top = top + "px";
            el.style.bottom = "";
            popup.isTopdown = true;
        }

        el.style.display = "";
        this.renderer.$textLayer.checkForSizeChanges();

        var left = pos.left;
        if (left + el.offsetWidth > screenWidth)
            left = screenWidth - el.offsetWidth;

        el.style.left = left + "px";

        this._signal("show");
        lastMouseEvent = null;
        popup.isOpen = true;
    };

    popup.getTextLeftOffset = function() {
        return this.$borderSize + this.renderer.$padding + this.$imageSize;
    };

    popup.$imageSize = 0;
    popup.$borderSize = 1;

    return popup;
};

dom.importCssString("\
.ace_editor.ace_autocomplete .ace_marker-layer .ace_active-line {\
    background-color: #CAD6FA;\
    z-index: 1;\
}\
.ace_editor.ace_autocomplete .ace_line-hover {\
    border: 1px solid #abbffe;\
    margin-top: -1px;\
    background: rgba(233,233,253,0.4);\
}\
.ace_editor.ace_autocomplete .ace_line-hover {\
    position: absolute;\
    z-index: 2;\
}\
.ace_editor.ace_autocomplete .ace_scroller {\
   background: none;\
   border: none;\
   box-shadow: none;\
}\
.ace_rightAlignedText {\
    color: gray;\
    display: inline-block;\
    position: absolute;\
    right: 4px;\
    text-align: right;\
    z-index: -1;\
}\
.ace_editor.ace_autocomplete .ace_completion-highlight{\
    color: #000;\
    text-shadow: 0 0 0.01em;\
}\
.ace_editor.ace_autocomplete {\
    width: 280px;\
    z-index: 200000;\
    background: #fbfbfb;\
    color: #444;\
    border: 1px lightgray solid;\
    position: fixed;\
    box-shadow: 2px 3px 5px rgba(0,0,0,.2);\
    line-height: 1.4;\
}");

exports.AcePopup = AcePopup;

});

define("ace/autocomplete/util",["require","exports","module"], function(require, exports, module) {
"use strict";

exports.parForEach = function(array, fn, callback) {
    var completed = 0;
    var arLength = array.length;
    if (arLength === 0)
        callback();
    for (var i = 0; i < arLength; i++) {
        fn(array[i], function(result, err) {
            completed++;
            if (completed === arLength)
                callback(result, err);
        });
    }
};

var ID_REGEX = /[a-zA-Z_0-9\$\-\u00A2-\uFFFF]/;

exports.retrievePrecedingIdentifier = function(text, pos, regex) {
    regex = regex || ID_REGEX;
    var buf = [];
    for (var i = pos-1; i >= 0; i--) {
        if (regex.test(text[i]))
            buf.push(text[i]);
        else
            break;
    }
    return buf.reverse().join("");
};

exports.retrieveFollowingIdentifier = function(text, pos, regex) {
    regex = regex || ID_REGEX;
    var buf = [];
    for (var i = pos; i < text.length; i++) {
        if (regex.test(text[i]))
            buf.push(text[i]);
        else
            break;
    }
    return buf;
};

});

define("ace/autocomplete",["require","exports","module","ace/keyboard/hash_handler","ace/autocomplete/popup","ace/autocomplete/util","ace/lib/event","ace/lib/lang","ace/lib/dom","ace/snippets"], function(require, exports, module) {
"use strict";

var HashHandler = require("./keyboard/hash_handler").HashHandler;
var AcePopup = require("./autocomplete/popup").AcePopup;
var util = require("./autocomplete/util");
var event = require("./lib/event");
var lang = require("./lib/lang");
var dom = require("./lib/dom");
var snippetManager = require("./snippets").snippetManager;

var Autocomplete = function() {
    this.autoInsert = false;
    this.autoSelect = true;
    this.exactMatch = false;
    this.gatherCompletionsId = 0;
    this.keyboardHandler = new HashHandler();
    this.keyboardHandler.bindKeys(this.commands);

    this.blurListener = this.blurListener.bind(this);
    this.changeListener = this.changeListener.bind(this);
    this.mousedownListener = this.mousedownListener.bind(this);
    this.mousewheelListener = this.mousewheelListener.bind(this);

    this.changeTimer = lang.delayedCall(function() {
        this.updateCompletions(true);
    }.bind(this));

    this.tooltipTimer = lang.delayedCall(this.updateDocTooltip.bind(this), 50);
};

(function() {

    this.$init = function() {
        this.popup = new AcePopup(document.body || document.documentElement);
        this.popup.on("click", function(e) {
            this.insertMatch();
            e.stop();
        }.bind(this));
        this.popup.focus = this.editor.focus.bind(this.editor);
        this.popup.on("show", this.tooltipTimer.bind(null, null));
        this.popup.on("select", this.tooltipTimer.bind(null, null));
        this.popup.on("changeHoverMarker", this.tooltipTimer.bind(null, null));
        return this.popup;
    };

    this.getPopup = function() {
        return this.popup || this.$init();
    };

    this.openPopup = function(editor, prefix, keepPopupPosition) {
        if (!this.popup)
            this.$init();

        this.popup.setData(this.completions.filtered);

        editor.keyBinding.addKeyboardHandler(this.keyboardHandler);
        
        var renderer = editor.renderer;
        this.popup.setRow(this.autoSelect ? 0 : -1);
        if (!keepPopupPosition) {
            this.popup.setTheme(editor.getTheme());
            this.popup.setFontSize(editor.getFontSize());

            var lineHeight = renderer.layerConfig.lineHeight;

            var pos = renderer.$cursorLayer.getPixelPosition(this.base, true);
            pos.left -= this.popup.getTextLeftOffset();

            var rect = editor.container.getBoundingClientRect();
            pos.top += rect.top - renderer.layerConfig.offset;
            pos.left += rect.left - editor.renderer.scrollLeft;
            pos.left += renderer.$gutterLayer.gutterWidth;

            this.popup.show(pos, lineHeight);
        } else if (keepPopupPosition && !prefix) {
            this.detach();
        }
    };

    this.detach = function() {
        this.editor.keyBinding.removeKeyboardHandler(this.keyboardHandler);
        this.editor.off("changeSelection", this.changeListener);
        this.editor.off("blur", this.blurListener);
        this.editor.off("mousedown", this.mousedownListener);
        this.editor.off("mousewheel", this.mousewheelListener);
        this.changeTimer.cancel();
        this.hideDocTooltip();

        this.gatherCompletionsId += 1;
        if (this.popup && this.popup.isOpen)
            this.popup.hide();

        if (this.base)
            this.base.detach();
        this.activated = false;
        this.completions = this.base = null;
    };

    this.changeListener = function(e) {
        var cursor = this.editor.selection.lead;
        if (cursor.row != this.base.row || cursor.column < this.base.column) {
            this.detach();
        }
        if (this.activated)
            this.changeTimer.schedule();
        else
            this.detach();
    };

    this.blurListener = function(e) {
        var el = document.activeElement;
        var text = this.editor.textInput.getElement()
        if (el != text && ( !this.popup || el.parentNode != this.popup.container )
            && el != this.tooltipNode && e.relatedTarget != this.tooltipNode
            && e.relatedTarget != text
        ) {
            this.detach();
        }
    };

    this.mousedownListener = function(e) {
        this.detach();
    };

    this.mousewheelListener = function(e) {
        this.detach();
    };

    this.goTo = function(where) {
        var row = this.popup.getRow();
        var max = this.popup.session.getLength() - 1;

        switch(where) {
            case "up": row = row <= 0 ? max : row - 1; break;
            case "down": row = row >= max ? -1 : row + 1; break;
            case "start": row = 0; break;
            case "end": row = max; break;
        }

        this.popup.setRow(row);
    };

    this.insertMatch = function(data) {
        if (!data)
            data = this.popup.getData(this.popup.getRow());
        if (!data)
            return false;

        if (data.completer && data.completer.insertMatch) {
            data.completer.insertMatch(this.editor, data);
        } else {
            if (this.completions.filterText) {
                var ranges = this.editor.selection.getAllRanges();
                for (var i = 0, range; range = ranges[i]; i++) {
                    range.start.column -= this.completions.filterText.length;
                    this.editor.session.remove(range);
                }
            }
            if (data.snippet)
                snippetManager.insertSnippet(this.editor, data.snippet);
            else
                this.editor.execCommand("insertstring", data.value || data);
        }
        this.detach();
    };


    this.commands = {
        "Up": function(editor) { editor.completer.goTo("up"); },
        "Down": function(editor) { editor.completer.goTo("down"); },
        "Ctrl-Up|Ctrl-Home": function(editor) { editor.completer.goTo("start"); },
        "Ctrl-Down|Ctrl-End": function(editor) { editor.completer.goTo("end"); },

        "Esc": function(editor) { editor.completer.detach(); },
        "Return": function(editor) { return editor.completer.insertMatch(); },
        "Shift-Return": function(editor) { editor.completer.insertMatch(true); },
        "Tab": function(editor) {
            var result = editor.completer.insertMatch();
            if (!result && !editor.tabstopManager)
                editor.completer.goTo("down");
            else
                return result;
        },

        "PageUp": function(editor) { editor.completer.popup.gotoPageUp(); },
        "PageDown": function(editor) { editor.completer.popup.gotoPageDown(); }
    };

    this.gatherCompletions = function(editor, callback) {
        var session = editor.getSession();
        var pos = editor.getCursorPosition();

        var line = session.getLine(pos.row);
        var prefix = util.retrievePrecedingIdentifier(line, pos.column);

        this.base = session.doc.createAnchor(pos.row, pos.column - prefix.length);
        this.base.$insertRight = true;

        var matches = [];
        var total = editor.completers.length;
        editor.completers.forEach(function(completer, i) {
            completer.getCompletions(editor, session, pos, prefix, function(err, results) {
                if (!err)
                    matches = matches.concat(results);
                var pos = editor.getCursorPosition();
                var line = session.getLine(pos.row);
                callback(null, {
                    prefix: util.retrievePrecedingIdentifier(line, pos.column, results[0] && results[0].identifierRegex),
                    matches: matches,
                    finished: (--total === 0)
                });
            });
        });
        return true;
    };

    this.showPopup = function(editor) {
        if (this.editor)
            this.detach();

        this.activated = true;

        this.editor = editor;
        if (editor.completer != this) {
            if (editor.completer)
                editor.completer.detach();
            editor.completer = this;
        }

        editor.on("changeSelection", this.changeListener);
        editor.on("blur", this.blurListener);
        editor.on("mousedown", this.mousedownListener);
        editor.on("mousewheel", this.mousewheelListener);

        this.updateCompletions();
    };

    this.updateCompletions = function(keepPopupPosition) {
        if (keepPopupPosition && this.base && this.completions) {
            var pos = this.editor.getCursorPosition();
            var prefix = this.editor.session.getTextRange({start: this.base, end: pos});
            if (prefix == this.completions.filterText)
                return;
            this.completions.setFilter(prefix);
            if (!this.completions.filtered.length)
                return this.detach();
            if (this.completions.filtered.length == 1
            && this.completions.filtered[0].value == prefix
            && !this.completions.filtered[0].snippet)
                return this.detach();
            this.openPopup(this.editor, prefix, keepPopupPosition);
            return;
        }
        var _id = this.gatherCompletionsId;
        this.gatherCompletions(this.editor, function(err, results) {
            var detachIfFinished = function() {
                if (!results.finished) return;
                return this.detach();
            }.bind(this);

            var prefix = results.prefix;
            var matches = results && results.matches;

            if (!matches || !matches.length)
                return detachIfFinished();
            if (prefix.indexOf(results.prefix) !== 0 || _id != this.gatherCompletionsId)
                return;

            this.completions = new FilteredList(matches);

            if (this.exactMatch)
                this.completions.exactMatch = true;

            this.completions.setFilter(prefix);
            var filtered = this.completions.filtered;
            if (!filtered.length)
                return detachIfFinished();
            if (filtered.length == 1 && filtered[0].value == prefix && !filtered[0].snippet)
                return detachIfFinished();
            if (this.autoInsert && filtered.length == 1 && results.finished)
                return this.insertMatch(filtered[0]);

            this.openPopup(this.editor, prefix, keepPopupPosition);
        }.bind(this));
    };

    this.cancelContextMenu = function() {
        this.editor.$mouseHandler.cancelContextMenu();
    };

    this.updateDocTooltip = function() {
        var popup = this.popup;
        var all = popup.data;
        var selected = all && (all[popup.getHoveredRow()] || all[popup.getRow()]);
        var doc = null;
        if (!selected || !this.editor || !this.popup.isOpen)
            return this.hideDocTooltip();
        this.editor.completers.some(function(completer) {
            if (completer.getDocTooltip)
                doc = completer.getDocTooltip(selected);
            return doc;
        });
        if (!doc)
            doc = selected;

        if (typeof doc == "string")
            doc = {docText: doc}
        if (!doc || !(doc.docHTML || doc.docText))
            return this.hideDocTooltip();
        this.showDocTooltip(doc);
    };

    this.showDocTooltip = function(item) {
        if (!this.tooltipNode) {
            this.tooltipNode = dom.createElement("div");
            this.tooltipNode.className = "ace_tooltip ace_doc-tooltip";
            this.tooltipNode.style.margin = 0;
            this.tooltipNode.style.pointerEvents = "auto";
            this.tooltipNode.tabIndex = -1;
            this.tooltipNode.onblur = this.blurListener.bind(this);
        }

        var tooltipNode = this.tooltipNode;
        if (item.docHTML) {
            tooltipNode.innerHTML = item.docHTML;
        } else if (item.docText) {
            tooltipNode.textContent = item.docText;
        }

        if (!tooltipNode.parentNode)
            document.body.appendChild(tooltipNode);
        var popup = this.popup;
        var rect = popup.container.getBoundingClientRect();
        tooltipNode.style.top = popup.container.style.top;
        tooltipNode.style.bottom = popup.container.style.bottom;

        if (window.innerWidth - rect.right < 320) {
            tooltipNode.style.right = window.innerWidth - rect.left + "px";
            tooltipNode.style.left = "";
        } else {
            tooltipNode.style.left = (rect.right + 1) + "px";
            tooltipNode.style.right = "";
        }
        tooltipNode.style.display = "block";
    };

    this.hideDocTooltip = function() {
        this.tooltipTimer.cancel();
        if (!this.tooltipNode) return;
        var el = this.tooltipNode;
        if (!this.editor.isFocused() && document.activeElement == el)
            this.editor.focus();
        this.tooltipNode = null;
        if (el.parentNode)
            el.parentNode.removeChild(el);
    };

}).call(Autocomplete.prototype);

Autocomplete.startCommand = {
    name: "startAutocomplete",
    exec: function(editor) {
        if (!editor.completer)
            editor.completer = new Autocomplete();
        editor.completer.autoInsert = false;
        editor.completer.autoSelect = true;
        editor.completer.showPopup(editor);
        editor.completer.cancelContextMenu();
    },
    bindKey: "Ctrl-Space|Ctrl-Shift-Space|Alt-Space"
};

var FilteredList = function(array, filterText, mutateData) {
    this.all = array;
    this.filtered = array;
    this.filterText = filterText || "";
    this.exactMatch = false;
};
(function(){
    this.setFilter = function(str) {
        if (str.length > this.filterText && str.lastIndexOf(this.filterText, 0) === 0)
            var matches = this.filtered;
        else
            var matches = this.all;

        this.filterText = str;
        matches = this.filterCompletions(matches, this.filterText);
        matches = matches.sort(function(a, b) {
            return b.exactMatch - a.exactMatch || b.score - a.score;
        });
        var prev = null;
        matches = matches.filter(function(item){
            var caption = item.snippet || item.caption || item.value;
            if (caption === prev) return false;
            prev = caption;
            return true;
        });

        this.filtered = matches;
    };
    this.filterCompletions = function(items, needle) {
        var results = [];
        var upper = needle.toUpperCase();
        var lower = needle.toLowerCase();
        loop: for (var i = 0, item; item = items[i]; i++) {
            var caption = item.value || item.caption || item.snippet;
            if (!caption) continue;
            var lastIndex = -1;
            var matchMask = 0;
            var penalty = 0;
            var index, distance;

            if (this.exactMatch) {
                if (needle !== caption.substr(0, needle.length))
                    continue loop;
            }else{
                for (var j = 0; j < needle.length; j++) {
                    var i1 = caption.indexOf(lower[j], lastIndex + 1);
                    var i2 = caption.indexOf(upper[j], lastIndex + 1);
                    index = (i1 >= 0) ? ((i2 < 0 || i1 < i2) ? i1 : i2) : i2;
                    if (index < 0)
                        continue loop;
                    distance = index - lastIndex - 1;
                    if (distance > 0) {
                        if (lastIndex === -1)
                            penalty += 10;
                        penalty += distance;
                    }
                    matchMask = matchMask | (1 << index);
                    lastIndex = index;
                }
            }
            item.matchMask = matchMask;
            item.exactMatch = penalty ? 0 : 1;
            item.score = (item.score || 0) - penalty;
            results.push(item);
        }
        return results;
    };
}).call(FilteredList.prototype);

exports.Autocomplete = Autocomplete;
exports.FilteredList = FilteredList;

});

define("ace/autocomplete/text_completer",["require","exports","module","ace/range"], function(require, exports, module) {
    var Range = require("../range").Range;
    
    var splitRegex = /[^a-zA-Z_0-9\$\-\u00C0-\u1FFF\u2C00-\uD7FF\w]+/;

    function getWordIndex(doc, pos) {
        var textBefore = doc.getTextRange(Range.fromPoints({row: 0, column:0}, pos));
        return textBefore.split(splitRegex).length - 1;
    }
    function wordDistance(doc, pos) {
        var prefixPos = getWordIndex(doc, pos);
        var words = doc.getValue().split(splitRegex);
        var wordScores = Object.create(null);
        
        var currentWord = words[prefixPos];

        words.forEach(function(word, idx) {
            if (!word || word === currentWord) return;

            var distance = Math.abs(prefixPos - idx);
            var score = words.length - distance;
            if (wordScores[word]) {
                wordScores[word] = Math.max(score, wordScores[word]);
            } else {
                wordScores[word] = score;
            }
        });
        return wordScores;
    }

    exports.getCompletions = function(editor, session, pos, prefix, callback) {
        var wordScore = wordDistance(session, pos, prefix);
        var wordList = Object.keys(wordScore);
        callback(null, wordList.map(function(word) {
            return {
                caption: word,
                value: word,
                score: wordScore[word],
                meta: "local"
            };
        }));
    };
});

define("ace/ext/language_tools",["require","exports","module","ace/snippets","ace/autocomplete","ace/config","ace/lib/lang","ace/autocomplete/util","ace/autocomplete/text_completer","ace/editor","ace/config"], function(require, exports, module) {
"use strict";

var snippetManager = require("../snippets").snippetManager;
var Autocomplete = require("../autocomplete").Autocomplete;
var config = require("../config");
var lang = require("../lib/lang");
var util = require("../autocomplete/util");

var textCompleter = require("../autocomplete/text_completer");
var keyWordCompleter = {
    getCompletions: function(editor, session, pos, prefix, callback) {
        if (session.$mode.completer) {
            return session.$mode.completer.getCompletions(editor, session, pos, prefix, callback);
        }
        var state = editor.session.getState(pos.row);
        var completions = session.$mode.getCompletions(state, session, pos, prefix);
        callback(null, completions);
    }
};

var snippetCompleter = {
    getCompletions: function(editor, session, pos, prefix, callback) {
        var snippetMap = snippetManager.snippetMap;
        var completions = [];
        snippetManager.getActiveScopes(editor).forEach(function(scope) {
            var snippets = snippetMap[scope] || [];
            for (var i = snippets.length; i--;) {
                var s = snippets[i];
                var caption = s.name || s.tabTrigger;
                if (!caption)
                    continue;
                completions.push({
                    caption: caption,
                    snippet: s.content,
                    meta: s.tabTrigger && !s.name ? s.tabTrigger + "\u21E5 " : "snippet",
                    type: "snippet"
                });
            }
        }, this);
        callback(null, completions);
    },
    getDocTooltip: function(item) {
        if (item.type == "snippet" && !item.docHTML) {
            item.docHTML = [
                "<b>", lang.escapeHTML(item.caption), "</b>", "<hr></hr>",
                lang.escapeHTML(item.snippet)
            ].join("");
        }
    }
};

var completers = [snippetCompleter, textCompleter, keyWordCompleter];
exports.setCompleters = function(val) {
    completers = val || [];
};
exports.addCompleter = function(completer) {
    completers.push(completer);
};
exports.textCompleter = textCompleter;
exports.keyWordCompleter = keyWordCompleter;
exports.snippetCompleter = snippetCompleter;

var expandSnippet = {
    name: "expandSnippet",
    exec: function(editor) {
        return snippetManager.expandWithTab(editor);
    },
    bindKey: "Tab"
};

var onChangeMode = function(e, editor) {
    loadSnippetsForMode(editor.session.$mode);
};

var loadSnippetsForMode = function(mode) {
    var id = mode.$id;
    if (!snippetManager.files)
        snippetManager.files = {};
    loadSnippetFile(id);
    if (mode.modes)
        mode.modes.forEach(loadSnippetsForMode);
};

var loadSnippetFile = function(id) {
    if (!id || snippetManager.files[id])
        return;
    var snippetFilePath = id.replace("mode", "snippets");
    snippetManager.files[id] = {};
    config.loadModule(snippetFilePath, function(m) {
        if (m) {
            snippetManager.files[id] = m;
            if (!m.snippets && m.snippetText)
                m.snippets = snippetManager.parseSnippetFile(m.snippetText);
            snippetManager.register(m.snippets || [], m.scope);
            if (m.includeScopes) {
                snippetManager.snippetMap[m.scope].includeScopes = m.includeScopes;
                m.includeScopes.forEach(function(x) {
                    loadSnippetFile("ace/mode/" + x);
                });
            }
        }
    });
};

function getCompletionPrefix(editor) {
    var pos = editor.getCursorPosition();
    var line = editor.session.getLine(pos.row);
    var prefix;
    editor.completers.forEach(function(completer) {
        if (completer.identifierRegexps) {
            completer.identifierRegexps.forEach(function(identifierRegex) {
                if (!prefix && identifierRegex)
                    prefix = util.retrievePrecedingIdentifier(line, pos.column, identifierRegex);
            });
        }
    });
    return prefix || util.retrievePrecedingIdentifier(line, pos.column);
}

var doLiveAutocomplete = function(e) {
    var editor = e.editor;
    var hasCompleter = editor.completer && editor.completer.activated;
    if (e.command.name === "backspace") {
        if (hasCompleter && !getCompletionPrefix(editor))
            editor.completer.detach();
    }
    else if (e.command.name === "insertstring") {
        var prefix = getCompletionPrefix(editor);
        if (prefix && !hasCompleter) {
            if (!editor.completer) {
                editor.completer = new Autocomplete();
            }
            editor.completer.autoInsert = false;
            editor.completer.showPopup(editor);
        }
    }
};

var Editor = require("../editor").Editor;
require("../config").defineOptions(Editor.prototype, "editor", {
    enableBasicAutocompletion: {
        set: function(val) {
            if (val) {
                if (!this.completers)
                    this.completers = Array.isArray(val)? val: completers;
                this.commands.addCommand(Autocomplete.startCommand);
            } else {
                this.commands.removeCommand(Autocomplete.startCommand);
            }
        },
        value: false
    },
    enableLiveAutocompletion: {
        set: function(val) {
            if (val) {
                if (!this.completers)
                    this.completers = Array.isArray(val)? val: completers;
                this.commands.on('afterExec', doLiveAutocomplete);
            } else {
                this.commands.removeListener('afterExec', doLiveAutocomplete);
            }
        },
        value: false
    },
    enableSnippets: {
        set: function(val) {
            if (val) {
                this.commands.addCommand(expandSnippet);
                this.on("changeMode", onChangeMode);
                onChangeMode(null, this);
            } else {
                this.commands.removeCommand(expandSnippet);
                this.off("changeMode", onChangeMode);
            }
        },
        value: false
    }
});
});

define("ace/mode/cql",["require","exports","module","ace/lib/oop","ace/mode/text","ace/tokenizer","ace/mode/matching_brace_outdent","ace/worker/worker_client","ace/mode/cql_highlight_rules","ace/mode/cql/cqlLexer","ace/mode/cql/model_completer","ace/ext/language_tools"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var Tokenizer = require("../tokenizer").Tokenizer;
var MatchingBraceOutdent = require("./matching_brace_outdent").MatchingBraceOutdent;
var WorkerClient = require("../worker/worker_client").WorkerClient;
var CqlHighlightRules = require("./cql_highlight_rules").CqlHighlightRules;
var cqlLexer = require("./cql/cqlLexer");
var cqlModelCompleter =require("./cql/model_completer").ModelCompleter;
var langTools = require("ace/ext/language_tools");
langTools.addCompleter(cqlModelCompleter);

var Mode = function() {
    this.HighlightRules = CqlHighlightRules;
    this.$outdent = new MatchingBraceOutdent();
};
oop.inherits(Mode, TextMode);

(function() {
    this.lineCommentStart = "//";
    this.blockComment = {start: "/*", end: "*/"};
    this.getNextLineIndent = function(state, line, tab) {
        var indent = this.$getIndent(line);
        return indent;
    };

    this.checkOutdent = function(state, line, input) {
        return this.$outdent.checkOutdent(line, input);
    };

    this.autoOutdent = function(state, doc, row) {
        this.$outdent.autoOutdent(doc, row);
    };
    this.createWorker = function(session) {
        var worker = new WorkerClient(["ace"], "ace/mode/cql_worker", "Worker");
        worker.session = session;
         worker.attachToDocument(session.getDocument());
        
        worker.on("annotate", function(e) {
            session.setAnnotations(e.data);
        });

        
        worker.on("terminate", function() {
            session.clearAnnotations();
        });

        worker.on("updateCqlModel", function(cqlModel) {
            session.cqlModel = cqlModel;
        });
        return worker;
    };

    this.$id = "ace/mode/cql";
}).call(Mode.prototype);
 
exports.Mode = Mode;
});
