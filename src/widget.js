(function( $ ) {
  $.widget( "demo.workspaces", {

    // These options will be used as defaults
    options: { 
      delgate: null,
      save: null,
      close: null,
      destroy: null,
      ace: null,
      theme: 'ace/theme/monokai',
      tabDecorator: null,
      contentDecorater: null
    },
    
    // Set up the widget
    _create: function() {
      var self = this;
      this.editors = [];
      this.tabContent = this.element; //$( "<div style='height: 500px'>" )
      this.element.append( this.tabContent );
      this.tabMenu = $( "<ul>" );
      this.tabContent.append( this.tabMenu );
      this.tabs = this.tabContent.tabs({
          activate: function( event, ui ) {
            self.getAce().edit(ui.newPanel[0]).resize(true)
          }});
      this.tabTemplate = "<li><a class='ace-workspace-tab' href='#{href}'>#{label}</a><span class='ui-icon ui-icon-close' role='presentation'>Remove Tab</span></li>",
      this.tabCounter = 0;

     // close icon: removing the tab on click
      this.tabs.delegate( "span.ui-icon-close", "click", function() {
        var panelId = $( this ).closest( "li" ).remove().attr( "aria-controls" );
        $( "#" + panelId ).remove();
        self.tabContent.tabs( "refresh" );
      });
      
      this.tabs.bind( "keyup", function( event ) {
        if ( event.altKey && event.keyCode === $.ui.keyCode.BACKSPACE ) {
          var panelId = self.tabs.find( ".ui-tabs-active" ).remove().attr( "aria-controls" );
          $( "#" + panelId ).remove();
          self.tabContent.tabs( "refresh" );
        }
      });

     this.tabs.find( ".ui-tabs-nav" ).sortable({
         axis: "x",
         stop: function() {
           self.tabContent.tabs( "refresh" );
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
    getAce: function(){
      return this.options.ace || window.ace;
    },
    open: function(name,content){
      name = name? name : "untilted";
      content = content? content: "";
      var id = "tabs-" + this.tabCounter,
      li = $( this.tabTemplate.replace( /#\{href\}/g, "#" + id ).replace( /#\{label\}/g, name ) ),
      tabContentHtml = content;
      this.getAce().config.set("basePath", "src/ace-build");
      this.tabs.find( ".ui-tabs-nav" ).append( li );
      console.log($("span",li))
      $(".ace-workspace-tab", li).contextmenu({
         
          menu: [
              {title: "save", cmd: "save", uiIcon: "ui-icon-save"},
              {title: "close", cmd: "close", uiIcon: "ui-icon-close"},
              {title: "close all", cmd: "closeAll", uiIcon: "ui-icon-close"},
              {title: "close others", cmd: "closeOthers", uiIcon: "ui-icon-close"},
              {title: "reset", cmd: "reset", uiIcon: "ui-icon-reset"},
              
              ],
          select: function(event, ui) {
              if(ui.cmd === "save"){
                alert("saving " + this.getAce().edit(id).getValue())
              }else{
               alert("select " + ui.cmd + " on " + ui.target.text());
               }
          }
      });
      this.tabs.append( "<div id='" + id + "' style='height:100%'><p>" + tabContentHtml + "</p></div>" );
      var editor = this.getAce().edit(id);
      editor.setTheme('ace/theme/monokai');
      editor.getSession().setMode('ace/mode/cql');
      editor.setOptions({
        "enableBasicAutocompletion": true,
        "enableLiveAutocompletion": true,
        "enableSnippets": true
  }     );

      this.tabs.tabs( "refresh" );
      
      console.log( this.tabs.find( ".ui-tabs-nav" ));
      this.tabs.tabs( {active: $("[role=tab]").length -1} );
      this.tabCounter++;
    }
  });
}( jQuery ) );