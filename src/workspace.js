function Tab(li){

}

(function( $ ) {
  $.widget( "demo.workspace", {

    // These options will be used as defaults
    options: { 
      delgate: null,
      save: null,
      close: null,
      destroy: null,
      },
    
    // Set up the widget
    _create: function() {
      var self = this;
      this.editors = [];
      this.element.addClass("workspace"); //$( "<div style='height: 500px'>" )
      this.editorArea = $( "<div class='workspace-editor-area'>" )
      this.tabMenu = $( "<ul class='workspace-tabs'>" )
      this.element.append( this.tabMenu );
      this.element.append(this.editorArea);
      this.tabs = this.element.tabs({
          activate: function( event, ui ) {
            ui.newTab.data().editor.activate();
          }});
      this.tabTemplate = "<li><a class='workspace-tab' href='#{href}'>#{label}</a><span class='ui-icon ui-icon-close' role='presentation'>Remove Tab</span></li>",
      this.tabCounter = 0;

     // close icon: removing the tab on click
      this.tabs.delegate( "span.ui-icon-close", "click", function() {
        var li = $( this ).closest( "li" );
        var editor = li.editor
        if(editor){
          editor.close();
        }else{ 
          var panelId = li.remove().attr( "aria-controls" );
          $( "#" + panelId ).remove();
          self.element.tabs( "refresh" );
        }
      });
      

     this.tabs.find( ".ui-tabs-nav" ).sortable({
         axis: "x",
         stop: function() {
           self.element.tabs( "refresh" );
         }
         });

      // this.contentPane = $( "<div>" ).insertAfter( this.tabMenu );
    },
 
    // Use the _setOption method to respond to changes to options
    _setOption: function( key, value ) {
      switch( key ) {
        case "clear":
          // handle changes to clear option
          break;
      }
 
      // In jQuery UI 1.8, you have to manually invoke the _setOption method from the base widget
      $.Widget.prototype._setOption.apply( this, arguments );
      // In jQuery UI 1.9 and above, you use the _super method instead
      this._super( "_setOption", key, value );
    },
 
    // Use the destroy method to clean up any modifications your widget has made to the DOM
    destroy: function() {
      this.editors.each(function(editor){
         editor.close();
      });
      // In jQuery UI 1.8, you must invoke the destroy method from the base widget
      $.Widget.prototype.destroy.call( this );
      // In jQuery UI 1.9 and above, you would define _destroy instead of destroy and not call the base method
    },
    activeEditor: function(){
      var activeTab = this.tabs.data().uiTabs.active
      this.editors.each(function(editor){
        if(editor.$tab == activeTab){
          return editor;
        }
      });
    },
    closeAll: function(){
      this.editors.each(function(editor){
        editor.close();
      });
    },
    closeOthers: function(tab){
      this.editors.each(function(editor){
        if(editor.$tab != tab){
          editor.close();
        }
      });
    },
    close: function(editor,params){
     var cls = !editor.isDirty();
      if(!cls){
        // dialog box asking if to save
        var sv = true;
        if(sv){
          this.save({success: editor.close})
        }else {
          this._close();
        }
      }

      if(cls){this._close()}
    },
    save: function(editor, params){
      if(this.delegate){
        this.delegate.save(editor,params);
      }
    },
    registerEditor: function(editor){
      this.editors.push(editor);
    },
    unregisterEditor: function(editor){
      this.editors.remove(editor);
    },
    closeEditor: function(editor){
      this.unregisterEditor(editor);
    },
    open: function(name,content, proto, options){
      var editor = new proto(this,name,content, options);
      this._create_tab_and_content(editor, options);
      this.editors.push(editor)
      return editor;
    },
    _next_tab_id: function(){
      return "tabs-" + this.tabCounter++;
    },
    _updateTitle: function(editor){
      $("a", editor.$tab).html(editor.name)
    },
    _create_tab_and_content: function(editor, options) {
      var id = this._next_tab_id()
      var li = $( this.tabTemplate.replace( /#\{href\}/g, "#" + id ).replace( /#\{label\}/g, editor.name ))    
      var div = $("<div id='" + id + "' class='workspace-editor'>")
      this.tabs.find( ".ui-tabs-nav" ).append( li );
      li.data().editor = editor;
      editor.$tab = li
      $(".workspace-tab").contextmenu({
         
          menu: [
              {title: "save", cmd: "save", uiIcon: "ui-icon-save"},
              {title: "close", cmd: "close", uiIcon: "ui-icon-close"},
              {title: "close all", cmd: "closeAll", uiIcon: "ui-icon-close"},
              {title: "close others", cmd: "closeOthers", uiIcon: "ui-icon-close"},
              {title: "reset", cmd: "reset", uiIcon: "ui-icon-reset"},
              
              ],
          select: function(event, ui) {
             switch(ui.cmd){
              case "closeOthers":
                self.closeOthers(editor);
              case "closeAll" :
                self.closeAll();
              defualt : 
                if(editor[ui.cmd]){
                  editor[ui.cmd]();
                } 
             }
          }
      });
      
      this.editorArea.append( div );
      editor.getView(div);
      this.tabs.tabs( "refresh" );
      this.tabs.tabs( {active: $("[role=tab]").length -1} );

    }
  });
}( jQuery ) );