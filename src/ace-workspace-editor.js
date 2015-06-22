var AceWorkspaceEditorDefaultOptions = {}

function AceWorkspaceEditor(workspace, name , content ,options){
  this.name = name || "untitled";
  this.$originalContent = content || "";
  this.options = {}
  $.extend(this.options, AceWorkspaceEditorDefaultOptions,options )
  this.$workspace = workspace;
  //this.$id = id;
  this.$tab = null;
  this.$contentElement = null; 
  this.$aceEditor = null;
  this.$aceSession = null;
  this.$ace = options.ace || window.ace;
}

AceWorkspaceEditor.prototype._initializeView = function(div){
  this.$contentDiv = div;
  this.$aceEditor = this.$ace.edit(this.$contentDiv[0]);
  this.$aceEditor.setTheme(this.options.theme);
  this.$aceEditor.getSession().setMode(this.options.mode);
  this.$aceEditor.setOptions({
    "enableBasicAutocompletion": true,
    "enableLiveAutocompletion": true,
    "enableSnippets": true
  });
 this.$aceEditor.setValue(this.$originalContent);
}

AceWorkspaceEditor.prototype.getView = function(div){
  return this.$contentDiv ? this.$contentDiv : this._initializeView(div);
}

AceWorkspaceEditor.prototype.activate = function(){
  return this.$aceEditor.resize(true);
}
AceWorkspaceEditor.prototype.isDirty = function(){
 return this.$aceEditor.getValue() != this.$originalContent;
}
AceWorkspaceEditor.prototype.save = function(params){
  this.$workspace.save(this, params)
}

AceWorkspaceEditor.prototype.close = function(params){
  this.$workspace.close(this, params)
}

AceWorkspaceEditor.prototype._close = function(){
  this.$aceEditor.destroy();
  var panelId =$tab.remove().attr( "aria-controls" );
  $( "#" + panelId ).remove();

}

AceWorkspaceEditor.prototype.reset = function(){
  this.$aceEditor.setValue(this.$originalContent);
  this.$workspace.refresh()
}

AceWorkspaceEditor.prototype.destroy = function(){
  var destory = true; //ask a dialog to confirm removal
  if(destroy){
    $(this.$workspace).destroy(this);
    this._close();
  }
}

AceWorkspaceEditor.prototype.setName = function(name){
  if(name != this.name){
    this.name = name;
    this.$workspace._updateTitle(this);
  }
}

AceWorkspaceEditor.prototype.getName = function(){
  return this.name;
}

AceWorkspaceEditor.prototype.getContent = function(){
    this.$aceEditor.getValue()
}

AceWorkspaceEditor.prototype.getWorkspace = function(){
  return $(this.$workspace);
}

