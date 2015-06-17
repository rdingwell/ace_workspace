define("ace/snippets/cql",["require","exports","module"], function(require, exports, module) {
"use strict";

exports.snippetText = "snippet using\n\
	using ${1:model} version ${2:version}\n\
snippet inc \n\
	include ${1:library} version '${2:version}' called ${3:indentifier}\n\
snippet lib\n\
	library ${1:name} version '${2:version}'\n\
snippet vset \n\
	valueset ${1:identifier} ':' ${2:valueset_id} version ${3:version}\n\
snippet param\n\
	parameter ${1:identifier} (${2:type}) default ${3:expression}\n\
snippet fun\n\
	define function ${1:name} (${2}) : ${3:body}\n\
snippet opt\n\
	${1:name} ${2:type}\n\
\n\
snippet ret\n\
	[${1:type} ${2}] ${3}\n\
snippet ret_path\n\
	: ${1: path} ${2: in} ${3: valueset}\n\
snippet with\n\
	with ${1:identifier} ${2:alias} such that ${3: expression}\n\
snippet without\n\
	without ${1:identifier} ${2:alias} such that ${3: expression}\n\
snippet def\n\
	define ${1:public|private} ${2: identifier} : ${3:expression}\n\
\n\
snippet And:\n\
	And(${1}, ${2})\n\
snippet Or\n\
	Or(${1}, ${2})\n\
snippet Not\n\
	Not(${1})\n\
snippet Null\n\
	Null()\n\
snippet IsNull:\n\
	IsNull(${1})\n\
snippet IfNull\n\
	IfNull(${1}, ${2})\n\
snippet Coalesce\n\
	Coalesce(${1}, ${2})\n\
snippet Equal\n\
	Equal(${1}, ${2})\n\
snippet NotEqual\n\
	NotEqual(${1}, ${2})\n\
snippet Less\n\
	Less(${1}, ${2})\n\
snippet LessOrEqual\n\
	LessOrEqual(${1}, ${2})\n\
snippet Greater\n\
	Greater(${1}, ${2})\n\
snippet GreaterOrEqual\n\
	GreaterOrEqual(${1}, ${2})\n\
snippet Add\n\
	Add(${1}, ${2})\n\
snippet Subtract\n\
	Subtract(${1}, ${2})\n\
snippet Multiply\n\
	Multiply(${1}, ${2})\n\
snippet Divide\n\
	Divide(${1}, ${2})\n\
snippet TruncatedDivide\n\
	TruncatedDivide(${1}, ${2})\n\
snippet Modulo\n\
	Modulo(${1}, ${2})\n\
snippet Ceiling\n\
	Ceiling(${1})\n\
snippet Floor\n\
	Floor(${1})\n\
snippet Truncate\n\
	Truncate(${1})\n\
snippet Abs\n\
	Abs(${1})\n\
snippet Negate\n\
	Negate(${1})\n\
snippet Round\n\
	Round(${1})\n\
snippet Ln\n\
	Ln(${1})\n\
snippet Log\n\
	Log(${1}, ${2})\n\
snippet Power\n\
	Power(${1}, ${2})\n\
snippet Succ\n\
	Succ(${1})\n\
snippet Pred\n\
	Pred(${1})\n\
snippet MinValue\n\
	MinValue(${1})\n\
snippet MaxValue\n\
	MaxValue(${1})\n\
snippet DateAdd\n\
	DateAdd(${1})\n\
snippet DateDiff\n\
	DateDiff(${1}, ${2})\n\
snippet DatePart\n\
	DatePart(${1}, ${2})\n\
snippet Today\n\
	Today(${1})\n\
snippet Now\n\
	Now(${1})\n\
snippet Date\n\
	Date(${1})\n\
snippet DateOf\n\
	DateOf(${1})\n\
snippet TimeOf\n\
	TimeOf(${1})\n\
snippet Concat\n\
	Concat(${1})\n\
snippet Combine\n\
	Combine(${1}, ${2})\n\
snippet Split\n\
	Split(${1}, ${2})\n\
snippet Length\n\
	Length(${1})\n\
snippet Upper\n\
	Upper(${1})\n\
snippet Lower\n\
	Lower(${1})\n\
snippet Indexer\n\
	Indexer(${1})\n\
snippet Pos\n\
	Pos(${1}, ${2})\n\
snippet Substring\n\
	Substring(${1}, ${2})\n\
snippet Equal\n\
	Equal(${1}, ${2})\n\
snippet NotEqual\n\
	NotEqual(${1}, ${2})\n\
snippet Contains\n\
	Contains(${1}, ${2})\n\
snippet In\n\
	In(${1}, ${2})\n\
snippet Includes\n\
	Includes(${1}, ${2})\n\
snippet IncludedIn\n\
	IncludedIn(${1}, ${2})\n\
snippet ProperIncludes\n\
	ProperIncludes(${1}, ${2})\n\
snippet ProperIncludedIn\n\
	ProperIncludedIn(${1}, ${2})\n\
snippet Before\n\
	Before(${1}, ${2})\n\
snippet After\n\
	After(${1}, ${2})\n\
snippet Meets\n\
	Meets(${1}, ${2})\n\
snippet Overlaps\n\
	Overlaps(${1}, ${2})\n\
snippet OverlapsBefore\n\
	OverlapsBefore(${1}, ${2})\n\
snippet OverlapsAfter\n\
	OverlapsAfter(${1}, ${2})\n\
snippet Union\n\
	Union(${1}, ${2})\n\
snippet Intersect\n\
	Intersect(${1}, ${2})\n\
snippet Difference\n\
	Difference(${1}, ${2})\n\
snippet Length\n\
	Length(${1})\n\
snippet Begin\n\
	Begin(${1})\n\
snippet End\n\
	End(${1})\n\
snippet Begins\n\
	Begins(${1}, ${2})\n\
snippet Ends\n\
	Ends(${1}, ${2})\n\
snippet List\n\
	List(${1}, ${2})\n\
snippet IsEmpty\n\
	IsEmpty(${1})\n\
snippet IsNotEmpty\n\
	IsNotEmpty(${1})\n\
snippet Equal\n\
	Equal(${1}, ${2})\n\
snippet NotEqual\n\
	NotEqual(${1}, ${2})\n\
snippet Union\n\
	Union(${1}, ${2})\n\
snippet Difference\n\
	Difference(${1}, ${2})\n\
snippet Intersect\n\
	Intersect(${1}, ${2})\n\
snippet Filter\n\
	Filter(${1}, ${2})\n\
snippet IndexOf\n\
	IndexOf(${1}, ${2})\n\
snippet Indexer\n\
	Indexer(${1}, ${2})\n\
snippet In\n\
	In(${1}, ${2})\n\
snippet Contains\n\
	Contains(${1}, ${2})\n\
snippet Includes\n\
	Includes(${1}, ${2})\n\
snippet IncludedIn\n\
	IncludedIn(${1}, ${2})\n\
snippet ProperIncludes\n\
	ProperIncludes(${1}, ${2})\n\
snippet ProperIncludedIn\n\
	ProperIncludedIn(${1}, ${2})\n\
snippet Sort\n\
	Sort(${1}, ${2})\n\
snippet Expand\n\
	Expand(${1})\n\
snippet Distinct\n\
	Distinct(${1})\n\
snippet Current\n\
	Current(${1})\n\
snippet Count\n\
	Count(${1})\n\
snippet Sum\n\
	Sum(${1})\n\
snippet Min\n\
	Min(${1})\n\
snippet Max\n\
	Max(${1})\n\
snippet Avg\n\
	Avg(${1})\n\
snippet Median\n\
	Median(${1})\n\
snippet Mode\n\
	Mode(${1})\n\
snippet Variance\n\
	Variance(${1})\n\
snippet PopulationVariance\n\
	PopulationVariance(${1})\n\
snippet StdDev\n\
	StdDev(${1})\n\
snippet PopulationStdDev\n\
	PopulationStdDev(${1})\n\
snippet AllTrue\n\
	AllTrue(${1}, ${2})\n\
snippet AnyTrue\n\
	AnyTrue(${1}, ${2})\n\
	";
exports.scope = "cql";

});
