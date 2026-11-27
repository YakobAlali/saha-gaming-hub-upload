const platforms={
  github:{field:'name',pattern:/^[a-z\d](?:[a-z\d-]{0,38})$/i,base:'https://github.com/'},
  twitch:{field:'name',pattern:/^[a-z\d_]{4,25}$/i,base:'https://www.twitch.tv/'},
  spotify:{field:'id',pattern:/^[a-z\d]{1,64}$/i,base:'https://open.spotify.com/user/'},
  steam:{field:'id',pattern:/^\d{17}$/,base:'https://steamcommunity.com/profiles/'},
  youtube:{field:'id',pattern:/^UC[a-z\d_-]{22}$/i,base:'https://www.youtube.com/channel/'}
};

export function publicConnectionLinks(connections){
  const links={};
  if(!Array.isArray(connections))return links;
  for(const connection of connections){
    if(!connection||connection.visibility!==1||connection.verified!==true||connection.revoked===true)continue;
    const type=connection.type;
    if(!Object.hasOwn(platforms,type)||Object.hasOwn(links,type))continue;
    const {field,pattern,base}=platforms[type];
    const value=connection[field];
    if(typeof value==='string'&&pattern.test(value))links[type]=base+encodeURIComponent(value);
  }
  return links;
}
