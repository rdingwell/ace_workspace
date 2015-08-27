var Repository = function(baseUrl){
  this.baseUrl = baseUrl;
}

Repository.prototype.get = function(library,version) {
  return $.get(this.library_url(library,version))
};

Repository.prototype.save = function(editor) {
  return $.post(this.baseUrl,{data:editor.getContent()})
};

Repository.prototype.delete = function(editor) {
  return $.ajax({url: this.baseUrl,
           method: "DELETE"})
};

Repository.prototype.list = function() {
  return $.get(this.baseUrl)
};

Repository.prototype.library_url = function(library,version) {
  return this.baseUrl+"/"+library+"/"+version;
};
